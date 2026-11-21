import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { StateGraph, StateSchema, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import {
  DesignSchema,
  ExamplesSchema,
  JudgeSchema,
  README_FALLBACK,
  README_SECTIONS,
  validateDdl,
  validateOperations,
  validateReadme,
  validateDiagram,
  validateSeedSql,
  type Judge,
} from '../../shared';
import { requestJson, type JsonOutcome } from '../../llm';
import type { PipelineEvent, PipelineOptions } from './types';

export const GRAPH_VERSION = 7;

const STAGE_ATTEMPTS = 2;
const EMPTY_JSON_ERROR = 'the answer was not a JSON object';
const ASSET_PATHS = [
  'assets/ddl/schema.sql',
  'assets/seed/seed.sql',
  'assets/diagrams/er.mmd',
] as const;

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
            messages: [
              new HumanMessage(
                `STAGE:design\nPropose a small database pet-project from the topic: ${state.topic}.\nReturn one English JSON object with: title (string), summary (one factual paragraph), assumptions (1-6 short strings), features (2-8 short strings), tables (2-8 objects). Describe only what this project contains; do not fabricate citations or claim there is a running application.\nEach table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[]. Every column: name, type (INTEGER|BIGINT|SMALLINT|REAL|NUMERIC|TEXT|VARCHAR|BOOLEAN|DATE|TIMESTAMP), primaryKey:boolean, nullable:boolean, unique:boolean, length:number|null, defaultValue: a JSON string/number/boolean value (not SQL text) or null, references:{"table":string,"column":string}|null, comment (English). Each index: name, columns:[...], unique:boolean, comment. Every table has a non-null primary key. List parent tables BEFORE referencing children, references point only to an earlier table's primary/unique column of the SAME type. At least one meaningful foreign key. checks always []. Also return mermaid: one string holding the complete Mermaid erDiagram source for these exact tables (escape newlines as \\n). Start with "erDiagram"; give every table one "table_name {" block with one "TYPE column_name PK, FK, UK" line per column, listing only the markers that apply and separating multiple markers with commas. Give every foreign key one relationship line "parent ||--o{ child : column_name". Use the exact table, column and type names from this design; add no comments, directives, click links or extra statements. Also return ddl: one string of PostgreSQL DDL for these exact tables (escape newlines as \\n). Write one create table per table with these exact column types: integer, bigint, smallint, real, numeric, text, varchar(length), boolean, date, timestamp. Add "not null" when nullable is false or the column is a primary key, add "unique" when unique is true and it is not a primary key, and add "default <literal>" when defaultValue is set. Add one "constraint pk_<table> primary key (<columns>)" per table and one "constraint fk_<table>_<column> foreign key (<column>) references <parent> (<parent column>)" per foreign key. Write each index as "create [unique] index <name> on <table> (<columns>)". Use unquoted identifiers, lowercase keywords, no comments, no IF NOT EXISTS, no DROP or ALTER. Answer JSON only.`,
              ),
            ],
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
              messages: [
                new HumanMessage(
                  `STAGE:examples\nCreate realistic sample data and useful data operations for ${state.topic}.\nChecked design JSON:\n${JSON.stringify(design)}\nReturn one English JSON object with: tables (every table, 2-5 rows each, valid keys and cross-table references), operations (2-12 useful pet-project data operations). Each seed table: {"table":"<table name>","rows":[{"column":value}]}. INTEGER and NUMERIC values are JSON numbers; BOOLEAN values booleans; DATE/TIMESTAMP/TEXT/VARCHAR are strings. No SQL syntax in values. Each operation: {"name":"snake_case","title":"English description","tables":["table"],"parameters":["name"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}. Named parameters are :name and need not be columns; each declared parameter must appear in the SQL, and the SQL must not use undeclared parameters. No semicolons inside the statement, no comments, no DDL. Mention every table listed in each operation. Every statement is parsed and checked against the declared tables and parameters. Also return seedSql: one string with one INSERT per seed table (escape newlines as \\n), written as "insert into <table> (<columns>) values (<literals>), ...;". Use numbers unquoted, true/false for booleans, NULL for null, and single-quoted strings with doubled internal quotes. Use only the checked values; no comments, no ON CONFLICT, no RETURNING. Also return readme: one string holding the complete project README for this design (escape newlines as \\n), with a top-level title and these level-two sections: ${README_SECTIONS.join(', ')}. Embed the checked Mermaid source in a mermaid fence and include the "### ${README_FALLBACK}" subsection. Link only to ${ASSET_PATHS.join(', ')}; no raw HTML, external links or images. Answer JSON only.`,
                ),
              ],
              schema: ExamplesSchema,
              keys: Object.keys(ExamplesSchema.shape),
              emptyError: EMPTY_JSON_ERROR,
              verify: (value) => [
                ...validateSeedSql(value.seedSql),
                ...validateReadme(value.readme, ASSET_PATHS),
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
              new HumanMessage(
                `STAGE:judge\nReview these checked data and generated artifacts for ${state.topic}.\nDesign: ${JSON.stringify(design)}\nExamples: ${JSON.stringify(examples)}\nReturn one English JSON object with matches (boolean) and problems (array of short strings). Set matches true only if ddl creates exactly the design tables, columns, types, nullability, defaults, keys, foreign keys and indexes, seedSql inserts exactly the checked rows, each operation statement is plausible for its declared tables and parameters, and readme accurately documents the checked design, seed rows, operations and embedded ER source. Otherwise list the concrete problems. Answer JSON only.`,
              ),
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
    .addNode('validateStage', async (state) =>
      stage(options, 'validate', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        validateOperations(examples, design);
        const ddl = design.ddl;
        const seedSql = examples.seedSql;
        const diagram = design.mermaid;
        const readme = examples.readme;
        const issues = validateReadme(readme, ASSET_PATHS);
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
    .addEdge('examplesStage', 'judgeStage')
    .addEdge('judgeStage', 'validateStage')
    .addEdge('validateStage', 'publishStage')
    .addEdge('publishStage', END);
}
