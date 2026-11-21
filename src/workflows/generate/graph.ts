import { StateGraph, START, END } from '@langchain/langgraph';
import {
  DesignAnswerSchema,
  ExamplesSchema,
  JudgeSchema,
  validateDdl,
  validateOperations,
  validateReadme,
  validateSeedSql,
  validateSeedData,
  type Design,
  type Examples,
  type Judge,
} from '../../shared';
import { requestJson } from '../../llm';
import { publishArtifacts, ASSET_PATHS } from './artifacts';
import { PipelineState } from './pipelineState.schema';
import { renderDiagram } from './renderDiagram';
import { designPrompt, examplesPrompt, judgePrompt } from './prompts';
import type { PipelineOptions } from './types';

export const GRAPH_VERSION = 12;

async function stage<T>(
  { onEvent }: PipelineOptions,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  await onEvent?.({ kind: 'stage_started', stage: name });
  try {
    const result = await action();
    await onEvent?.({ kind: 'stage_finished', stage: name });
    return result;
  } catch (error) {
    await onEvent?.({
      kind: 'stage_failed',
      stage: name,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function requireValue<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Missing ${name} from previous stage`);
  return value;
}

function verifyExamples(examples: Examples, design: Design): string[] {
  return [
    ...validateSeedData(examples, design),
    ...validateSeedSql(examples.seedSql, examples),
    ...validateReadme(examples.readme, ASSET_PATHS, design.mermaid),
    ...validateOperations(examples, design),
  ];
}

function judgeViolations(value: Judge): string[] {
  if (value.problems.length > 0) return value.problems;
  if (value.matches) return [];
  return ['The SQL does not match the checked data.'];
}

/** A new run and a resume compile exactly the same graph. */
export function buildPipeline(options: PipelineOptions) {
  const { model } = options;
  return new StateGraph(PipelineState)
    .addNode('designStage', async (state) =>
      stage(options, 'design', async () => {
        const answer = await requestJson({
          model,
          stage: 'design',
          messages: designPrompt(state.topic),
          schema: DesignAnswerSchema,
          verify: (value) => validateDdl(value.ddl, value),
        });
        return { design: { ...answer, mermaid: await renderDiagram(answer) } };
      }),
    )
    .addNode('examplesStage', async (state) =>
      stage(options, 'examples', async () => {
        const design = requireValue(state.design, 'design');
        return {
          examples: await requestJson({
            model,
            stage: 'examples',
            messages: examplesPrompt(state.topic, design),
            schema: ExamplesSchema,
            verify: (examples) => verifyExamples(examples, design),
          }),
        };
      }),
    )
    .addNode('judgeStage', async (state) =>
      stage(options, 'judge', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        await requestJson({
          model,
          stage: 'judge',
          messages: judgePrompt(state.topic, design, examples),
          schema: JudgeSchema,
          verify: judgeViolations,
        });
        return {};
      }),
    )
    .addNode('publishStage', async (state) =>
      stage(options, 'publish', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        await publishArtifacts(options.workspace, design, examples);
        return {};
      }),
    )
    .addEdge(START, 'designStage')
    .addEdge('designStage', 'examplesStage')
    .addEdge('examplesStage', 'judgeStage')
    .addEdge('judgeStage', 'publishStage')
    .addEdge('publishStage', END);
}
