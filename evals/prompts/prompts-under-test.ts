import type { ChatTransport } from '../../src/adapters/llm';
import { createChatModel, createModelPort } from '../../src/adapters/llm';
import type { AppConfig } from '../../src/config';
import { loadConfig } from '../../src/config';
import { errorMessage } from '../../src/shared';
import type {
  ArtifactFile,
  ArtifactSinkPort,
  ModelPort,
  StructuredRequest,
} from '../../src/workflows/ports';
import {
  ASSET_PATHS,
  DesignAnswerSchema,
  ExamplesAnswerSchema,
  JudgeSchema,
  validateSeedData,
  type Design,
  type Examples,
  type ExamplesAnswer,
} from '../../src/workflows/generate/domain';
import {
  validateDdl,
  validateOperations,
  validateReadme,
} from '../../src/workflows/generate/rules';
import {
  publish,
  runDesign,
  runExamples,
  runJudge,
} from '../../src/workflows/generate/stages';
import type { PromptInput } from '../datasets';
import type {
  PromptRunOutcome,
  RejectionReason,
  RunErrors,
  StageAttempt,
  StageRun,
  StageRuns,
} from './types';

/**
 * Drives the real stages and prompts through the real model adapter, recording
 * every model call and the gate that rejected it. The last step publishes into
 * a recording sink so artifact completeness can be scored without disk writes.
 */
export class PromptStagesUnderTest {
  private constructor(private readonly config: AppConfig) {}

  static create(config: AppConfig = loadConfig()): PromptStagesUnderTest {
    return new PromptStagesUnderTest(config);
  }

  async run(input: PromptInput): Promise<PromptRunOutcome> {
    const recorder = new AttemptRecorder();
    let design: Design | null = null;
    const model = verifyingModel(this.config, recorder, (stage, value) =>
      classifyRejection(stage, value, design),
    );
    const stages = emptyStageRuns();
    const errors: RunErrors = {};

    const designResult = await this.measure(recorder, () =>
      runDesign(model, input.topic),
    );
    stages.design = designResult.run;
    if (designResult.error) errors.design = designResult.error;
    design = designResult.value;

    let examples: Examples | null = null;
    const acceptedDesign = design;
    if (acceptedDesign) {
      const result = await this.measure(recorder, () =>
        runExamples(model, input.topic, acceptedDesign),
      );
      stages.examples = result.run;
      if (result.error) errors.examples = result.error;
      examples = result.value;
    }

    const acceptedExamples = examples;
    if (acceptedDesign && acceptedExamples) {
      const result = await this.measure(recorder, () =>
        runJudge(model, input.topic, acceptedDesign, acceptedExamples),
      );
      stages.judge = result.run;
      if (result.error) errors.judge = result.error;
    }

    let published: string[] = [];
    if (acceptedDesign && acceptedExamples && stages.judge.accepted) {
      const sink = new RecordingArtifactSink();
      try {
        await publish(sink, 'eval', acceptedDesign, acceptedExamples);
        published = sink.paths;
      } catch (error) {
        errors.publish = errorMessage(error);
      }
    }

    return {
      topic: input.topic,
      design,
      examples,
      stages,
      errors,
      published,
    };
  }

  private async measure<T>(
    recorder: AttemptRecorder,
    action: () => Promise<T>,
  ): Promise<{ value: T | null; run: StageRun; error: string | null }> {
    const firstCall = recorder.total;
    try {
      return {
        value: await action(),
        run: recorder.stageRun(firstCall, true),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        run: recorder.stageRun(firstCall, false),
        error: errorMessage(error),
      };
    }
  }
}

/** One call is a transport failure, a schema rejection or a verified answer. */
class AttemptRecorder {
  private calls = 0;
  private readonly verified = new Map<number, RejectionReason[]>();
  private readonly transportFailures = new Set<number>();

  get total(): number {
    return this.calls;
  }

  nextCall(): number {
    this.calls += 1;
    return this.calls;
  }

  recordVerdict(call: number, reasons: readonly RejectionReason[]): void {
    this.verified.set(call, [...reasons]);
  }

  recordTransportFailure(call: number): void {
    this.transportFailures.add(call);
  }

  stageRun(firstCall: number, accepted: boolean): StageRun {
    const attempts: StageAttempt[] = [];
    for (let call = firstCall + 1; call <= this.calls; call += 1) {
      attempts.push({ reasons: this.reasonsFor(call) });
    }
    return { attempts, accepted };
  }

  private reasonsFor(call: number): RejectionReason[] {
    if (this.transportFailures.has(call)) return ['transport'];
    return this.verified.get(call) ?? ['schema'];
  }
}

function countingTransport(
  chat: ChatTransport,
  recorder: AttemptRecorder,
): ChatTransport {
  return {
    async invoke(messages) {
      const call = recorder.nextCall();
      try {
        return await chat.invoke(messages);
      } catch (error) {
        recorder.recordTransportFailure(call);
        throw error;
      }
    },
  };
}

function verifyingModel(
  config: AppConfig,
  recorder: AttemptRecorder,
  classify: (stage: string, value: unknown) => RejectionReason[],
): ModelPort {
  const transport = countingTransport(createChatModel(config.chat), recorder);
  const model = createModelPort(config.chat, transport);
  return {
    ...model,
    json<T>(request: StructuredRequest<T>): Promise<T> {
      return model.json<T>({
        ...request,
        verify: async (value) => {
          recorder.recordVerdict(
            recorder.total,
            classify(request.stage, value),
          );
          return request.verify(value);
        },
      });
    },
  };
}

function classifyRejection(
  stage: string,
  value: unknown,
  design: Design | null,
): RejectionReason[] {
  if (stage === 'design') {
    const answer = DesignAnswerSchema.safeParse(value);
    return answer.success && validateDdl(answer.data.ddl, answer.data).length
      ? ['ddl']
      : [];
  }
  if (stage === 'examples' && design) {
    const answer = ExamplesAnswerSchema.safeParse(value);
    if (!answer.success) return [];
    return exampleReasons(answer.data, design);
  }
  if (stage === 'judge') {
    const answer = JudgeSchema.safeParse(value);
    return answer.success &&
      (answer.data.problems.length > 0 || !answer.data.matches)
      ? ['judge']
      : [];
  }
  return [];
}

function exampleReasons(
  examples: ExamplesAnswer,
  design: Design,
): RejectionReason[] {
  const reasons: RejectionReason[] = [];
  if (validateSeedData(examples, design).length) reasons.push('seed');
  if (validateReadme(examples.readme, ASSET_PATHS, design.mermaid).length)
    reasons.push('readme');
  if (validateOperations(examples, design).length) reasons.push('operations');
  return reasons;
}

function emptyStageRuns(): StageRuns {
  const empty: StageRun = { attempts: [], accepted: false };
  return { design: empty, examples: empty, judge: empty };
}

class RecordingArtifactSink implements ArtifactSinkPort {
  readonly paths: string[] = [];

  async write(_root: string, files: readonly ArtifactFile[]): Promise<void> {
    this.paths.push(...files.map((file) => file.path));
  }
}
