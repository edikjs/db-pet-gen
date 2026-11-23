import { createModelPort } from '../../src/adapters/llm';
import type { AppConfig } from '../../src/config';
import { loadConfig } from '../../src/config';
import { errorMessage, redact } from '../../src/shared';
import type { ArtifactFile, ArtifactSinkPort } from '../../src/workflows/ports';
import {
  ASSET_PATHS,
  ExamplesAnswerSchema,
  validateSeedData,
  type Design,
  type Examples,
  type ExamplesAnswer,
} from '../../src/workflows/generate/domain';
import {
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
    const attempts: StageAttempt[] = [];
    let design: Design | null = null;
    const model = createModelPort(
      this.config.chat,
      undefined,
      (stage, attempt) => {
        if (attempt.kind === 'accepted') {
          attempts.push({ reasons: [] });
          return;
        }
        attempts.push({
          reasons:
            attempt.kind === 'verification'
              ? classifyRejection(stage, attempt.value, design)
              : [attempt.kind],
          detail: redact(attempt.error, this.config.chat.apiKey),
        });
      },
    );
    const stages = emptyStageRuns();
    const errors: RunErrors = {};

    const designResult = await this.measure(attempts, () =>
      runDesign(model, input.topic),
    );
    stages.design = designResult.run;
    if (designResult.error) errors.design = designResult.error;
    design = designResult.value;

    let examples: Examples | null = null;
    const acceptedDesign = design;
    if (acceptedDesign) {
      const result = await this.measure(attempts, () =>
        runExamples(model, input.topic, acceptedDesign),
      );
      stages.examples = result.run;
      if (result.error) errors.examples = result.error;
      examples = result.value;
    }

    const acceptedExamples = examples;
    if (acceptedDesign && acceptedExamples) {
      const result = await this.measure(attempts, () =>
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
        errors.publish = model.redact(errorMessage(error));
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
    attempts: StageAttempt[],
    action: () => Promise<T>,
  ): Promise<{ value: T | null; run: StageRun; error: string | null }> {
    const firstCall = attempts.length;
    try {
      return {
        value: await action(),
        run: { attempts: attempts.slice(firstCall), accepted: true },
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        run: { attempts: attempts.slice(firstCall), accepted: false },
        error: redact(errorMessage(error), this.config.chat.apiKey),
      };
    }
  }
}

function classifyRejection(
  stage: string,
  value: unknown,
  design: Design | null,
): RejectionReason[] {
  if (stage === 'design') return ['ddl'];
  if (stage === 'examples' && design) {
    const answer = ExamplesAnswerSchema.safeParse(value);
    if (!answer.success) return [];
    return exampleReasons(answer.data, design);
  }
  return ['judge'];
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
