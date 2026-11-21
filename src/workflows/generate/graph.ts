import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
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
import {
  designPrompt,
  EMPTY_JSON_ERROR,
  examplesPrompt,
  judgePrompt,
  STAGE_ATTEMPTS,
} from './prompts';
import type { PipelineEvent, PipelineOptions } from './types';

export const GRAPH_VERSION = 12;

async function report(
  options: PipelineOptions,
  event: PipelineEvent,
): Promise<void> {
  await options.onEvent?.(event);
}

async function stage<T>(
  options: PipelineOptions,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  await report(options, { kind: 'stage_started', stage: name });
  try {
    const result = await action();
    await report(options, { kind: 'stage_finished', stage: name });
    return result;
  } catch (error) {
    await report(options, {
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
  async function ask<T>(
    name: string,
    messages: BaseMessage[],
    schema: z.ZodType<T> & Pick<z.ZodObject, 'shape'>,
    verify: (value: T) => string[] | Promise<string[]>,
  ) {
    const outcome = await requestJson({
      model: options.model,
      messages,
      schema,
      keys: Object.keys(schema.shape),
      verify,
      emptyError: EMPTY_JSON_ERROR,
      corrective: (validationFeedback) =>
        JSON.stringify({ validationFeedback }),
      attempts: STAGE_ATTEMPTS,
    });
    if (!outcome.ok) {
      throw new Error(
        `The model did not return a usable ${name}: ${outcome.error}`,
      );
    }
    return outcome.data;
  }

  return new StateGraph(PipelineState)
    .addNode('designStage', async (state) =>
      stage(options, 'design', async () => {
        const answer = await ask(
          'design',
          designPrompt(state.topic),
          DesignAnswerSchema,
          (value) => validateDdl(value.ddl, value),
        );
        return { design: { ...answer, mermaid: await renderDiagram(answer) } };
      }),
    )
    .addNode('examplesStage', async (state) =>
      stage(options, 'examples', async () => {
        const design = requireValue(state.design, 'design');
        return {
          examples: await ask(
            'examples',
            examplesPrompt(state.topic, design),
            ExamplesSchema,
            (examples) => verifyExamples(examples, design),
          ),
        };
      }),
    )
    .addNode('judgeStage', async (state) =>
      stage(options, 'judge', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        await ask(
          'judge',
          judgePrompt(state.topic, design, examples),
          JudgeSchema,
          judgeViolations,
        );
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
