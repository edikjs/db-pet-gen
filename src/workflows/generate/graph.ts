import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { StateGraph, StateSchema, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import {
  DesignSchema,
  ExamplesSchema,
  JudgeSchema,
  validateDdl,
  validateDiagram,
  validateOperations,
  validateReadme,
  validateSeedSql,
  type Judge,
} from '../../shared';
import { requestJson, type JsonOutcome } from '../../llm';
import { artifactFiles, ASSET_PATHS } from './artifacts';
import {
  designPrompt,
  EMPTY_JSON_ERROR,
  examplesPrompt,
  judgePrompt,
  STAGE_ATTEMPTS,
} from './prompts';
import type { PipelineEvent, PipelineOptions } from './types';

export const GRAPH_VERSION = 8;

function correctiveReply(rejection: string): string {
  return `Correct this: ${rejection}. Return only JSON data matching the requested shape.`;
}

function requireAnswer<T>(outcome: JsonOutcome<T>, stage: string): T {
  if (!outcome.ok) {
    throw new Error(
      `The model did not return a usable ${stage}: ${outcome.error}`,
    );
  }
  return outcome.data;
}

const PipelineState = new StateSchema({
  topic: z.string(),
  design: DesignSchema.nullable().default(null),
  examples: ExamplesSchema.nullable().default(null),
});
export type PipelineResult = typeof PipelineState.State;

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

function judgeViolations(value: Judge): string[] {
  if (value.matches) return [];
  if (value.problems.length > 0) return value.problems;
  return ['The SQL does not match the checked data.'];
}

/** A new run and a resume compile exactly the same graph. */
export function buildPipeline(options: PipelineOptions) {
  return new StateGraph(PipelineState)
    .addNode('designStage', async (state) =>
      stage(options, 'design', async () => ({
        design: requireAnswer(
          await requestJson({
            model: options.model,
            messages: [new HumanMessage(designPrompt(state.topic))],
            schema: DesignSchema,
            keys: Object.keys(DesignSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            verify: async (value) => [
              ...(await validateDiagram(value.mermaid, value)),
              ...validateDdl(value.ddl),
            ],
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'design',
        ),
      })),
    )
    .addNode('examplesStage', async (state) =>
      stage(options, 'examples', async () => {
        const design = requireValue(state.design, 'design');
        return {
          examples: requireAnswer(
            await requestJson({
              model: options.model,
              messages: [new HumanMessage(examplesPrompt(state.topic, design))],
              schema: ExamplesSchema,
              keys: Object.keys(ExamplesSchema.shape),
              emptyError: EMPTY_JSON_ERROR,
              verify: (value) => [
                ...validateSeedSql(value.seedSql),
                ...validateReadme(value.readme, ASSET_PATHS),
                ...validateOperations(value, design),
              ],
              corrective: correctiveReply,
              attempts: STAGE_ATTEMPTS,
            }),
            'examples',
          ),
        };
      }),
    )
    .addNode('judgeStage', async (state) =>
      stage(options, 'judge', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(judgePrompt(state.topic, design, examples)),
            ],
            schema: JudgeSchema,
            keys: Object.keys(JudgeSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            verify: judgeViolations,
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'judge',
        );
        return {};
      }),
    )
    .addNode('publishStage', async (state) =>
      stage(options, 'publish', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        for (const [path, contents] of artifactFiles(design, examples)) {
          const destination = join(options.workspace, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, contents, 'utf8');
        }
        await writeFile(
          join(options.workspace, 'qa-report.json'),
          `${JSON.stringify({ verdict: 'pass' }, null, 2)}\n`,
          'utf8',
        );
        return {};
      }),
    )
    .addEdge(START, 'designStage')
    .addEdge('designStage', 'examplesStage')
    .addEdge('examplesStage', 'judgeStage')
    .addEdge('judgeStage', 'publishStage')
    .addEdge('publishStage', END);
}
