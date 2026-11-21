import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parseMermaid } from '@jarenjs/mermaid';
import { HumanMessage } from '@langchain/core/messages';
import { StateGraph, StateSchema, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import { DesignSchema, ExamplesSchema } from '../../shared';
import { requestJson, type JsonOutcome } from '../../llm';
import {
  renderDdl,
  renderSeedScript,
  validateOperations,
  lintReadme,
  renderErDiagram,
  renderReadme,
} from '../../io/renderers';
import type { PipelineEvent, PipelineOptions } from './types';

export const GRAPH_VERSION = 2;

const STAGE_ATTEMPTS = 2;
const EMPTY_JSON_ERROR = 'the answer was not a JSON object';

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

const ChecksSchema = z.object({
  sql: z.literal('passed'),
  mermaid: z.literal('passed'),
  markdown: z.literal('passed'),
});

const OutputSchema = z.object({
  ddl: z.string(),
  seedSql: z.string(),
  diagram: z.string(),
  readme: z.string(),
  checks: ChecksSchema,
});

const PipelineState = new StateSchema({
  topic: z.string(),
  design: DesignSchema.nullable().default(null),
  examples: ExamplesSchema.nullable().default(null),
  output: OutputSchema.nullable().default(null),
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

/** A new run and a resume compile exactly the same graph. */
export function buildPipeline(options: PipelineOptions) {
  return new StateGraph(PipelineState)
    .addNode('designStage', async (state) =>
      stage(options, 'design', async () => ({
        design: requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(
                `STAGE:design\nPropose a small database pet-project from the topic: ${state.topic}.\nReturn one English JSON object with: title (string), summary (one factual paragraph), assumptions (1-6 short strings), features (2-8 short strings), tables (2-8 objects). Describe only what this project contains; do not fabricate citations or claim there is a running application.\nEach table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[]. Every column: name, type (INTEGER|BIGINT|SMALLINT|REAL|NUMERIC|TEXT|VARCHAR|BOOLEAN|DATE|TIMESTAMP), primaryKey:boolean, nullable:boolean, unique:boolean, length:number|null, defaultValue: a JSON string/number/boolean value (not SQL text) or null, references:{"table":string,"column":string}|null, comment (English). Each index: name, columns:[...], unique:boolean, comment. Every table has a non-null primary key. List parent tables BEFORE referencing children, references point only to an earlier table's primary/unique column of the SAME type. At least one meaningful foreign key. checks always []. Answer JSON only.`,
              ),
            ],
            schema: DesignSchema,
            keys: Object.keys(DesignSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
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
              messages: [
                new HumanMessage(
                  `STAGE:examples\nCreate realistic sample data and useful data operations for ${state.topic}.\nChecked design JSON:\n${JSON.stringify(design)}\nReturn one English JSON object with: tables (every table, 2-5 rows each, valid keys and cross-table references), operations (2-12 useful pet-project data operations). Each seed table: {"table":"<table name>","rows":[{"column":value}]}. INTEGER and NUMERIC values are JSON numbers; BOOLEAN values booleans; DATE/TIMESTAMP/TEXT/VARCHAR are strings. No SQL syntax in values. Each operation: {"name":"snake_case","title":"English description","tables":["table"],"parameters":["column"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}. Named parameters are :column and each declared parameter must appear in the SQL. No semicolons inside the statement, no comments, no DDL. Mention every table listed in each operation. Every statement is parsed and checked against the declared tables and parameters. Answer JSON only.`,
                ),
              ],
              schema: ExamplesSchema,
              keys: Object.keys(ExamplesSchema.shape),
              emptyError: EMPTY_JSON_ERROR,
              corrective: correctiveReply,
              attempts: STAGE_ATTEMPTS,
            }),
            'examples',
          ),
        };
      }),
    )
    .addNode('renderStage', async (state) =>
      stage(options, 'render', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        validateOperations(examples, design);
        const ddl = renderDdl(design);
        const seedSql = renderSeedScript(examples, design);
        const diagram = renderErDiagram(design);
        try {
          parseMermaid(diagram);
        } catch (error) {
          throw new Error(
            `The generated Mermaid ER diagram is invalid: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        const readme = renderReadme({
          topic: state.topic,
          plan: design,
          model: design,
          seed: examples,
          operations: examples,
          diagram,
        });
        const paths = [
          'assets/ddl/schema.sql',
          'assets/seed/seed.sql',
          'assets/diagrams/er.mmd',
        ];
        const issues = lintReadme(readme, paths);
        if (issues.length)
          throw new Error(`Markdown QA failed: ${issues.join('; ')}`);
        return {
          output: {
            ddl,
            seedSql,
            diagram,
            readme,
            checks: { sql: 'passed', mermaid: 'passed', markdown: 'passed' },
          },
        };
      }),
    )
    .addNode('publishStage', async (state) =>
      stage(options, 'publish', async () => {
        const output = requireValue(state.output, 'validated output');
        const files = [
          ['assets/ddl/schema.sql', output.ddl],
          ['assets/seed/seed.sql', output.seedSql],
          ['assets/diagrams/er.mmd', output.diagram],
          ['README.md', output.readme],
        ];
        for (const [path, contents] of files) {
          const destination = join(options.workspace, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, contents, 'utf8');
        }
        await writeFile(
          join(options.workspace, 'qa-report.json'),
          `${JSON.stringify(
            { verdict: 'pass', checks: output.checks },
            null,
            2,
          )}\n`,
          'utf8',
        );
        return {};
      }),
    )
    .addEdge(START, 'designStage')
    .addEdge('designStage', 'examplesStage')
    .addEdge('examplesStage', 'renderStage')
    .addEdge('renderStage', 'publishStage')
    .addEdge('publishStage', END);
}
