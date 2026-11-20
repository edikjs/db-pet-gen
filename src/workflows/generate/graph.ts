import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HumanMessage } from '@langchain/core/messages';
import { StateGraph, StateSchema, START, END } from '@langchain/langgraph';
import { render as renderMermaid } from 'pele';
import { z } from 'zod';
import {
  CodePlanSchema,
  DataModelSchema,
  ProjectPlanSchema,
  SeedDataSchema,
  type CodePlan,
  type DataModel,
} from '../../shared';
import { requestJson, type JsonOutcome } from '../../llm';
import {
  renderDdl,
  renderSchemaOutline,
  renderSeedScript,
  renderCodeFiles,
  lintReadme,
  renderErDiagram,
  renderReadme,
} from '../../io/renderers';
import type { PipelineEvent, PipelineOptions } from './types';

export const GRAPH_VERSION = 1;

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

const SmokeSchema = z.object({
  status: z.enum(['passed', 'failed', 'skipped']),
  reason: z.string().nullable(),
  rowCounts: z.record(z.string(), z.number()),
});

const OutputSchema = z.object({
  ddl: z.string(),
  seedSql: z.string(),
  diagram: z.string(),
  codeFiles: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      summary: z.string(),
      content: z.string(),
    }),
  ),
  readme: z.string(),
  smoke: SmokeSchema,
});

const PipelineState = new StateSchema({
  topic: z.string(),
  plan: ProjectPlanSchema.nullable().default(null),
  database: DataModelSchema.nullable().default(null),
  seed: SeedDataSchema.nullable().default(null),
  codePlan: CodePlanSchema.nullable().default(null),
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
    .addNode('planStage', async (state) =>
      stage(options, 'plan', async () => ({
        plan: requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(
                `STAGE:plan\nPropose a small database pet-project from the topic: ${state.topic}.\nAnswer one English JSON object with: title (string), summary (one factual paragraph), assumptions (1-6 short strings), features (2-8 short strings). Describe only what this project contains; do not fabricate citations or claim there is a running application.`,
              ),
            ],
            schema: ProjectPlanSchema,
            keys: Object.keys(ProjectPlanSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'project plan',
        ),
      })),
    )
    .addNode('schemaStage', async (state) =>
      stage(options, 'schema', async () => ({
        database: requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(
                `STAGE:schema\nDesign the PostgreSQL-compatible database for "${state.topic}". Plan: ${JSON.stringify(requireValue(state.plan, 'plan'))}.\nReturn a JSON object {"tables":[...]}, 2-8 tables. Each table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[]. Every column: name, type (INTEGER|BIGINT|SMALLINT|REAL|NUMERIC|TEXT|VARCHAR|BOOLEAN|DATE|TIMESTAMP), primaryKey:boolean, nullable:boolean, unique:boolean, length:number|null, defaultValue:string|null, references:{"table":string,"column":string}|null, comment (English). Each index: name, columns:[...], unique:boolean, comment. Every table has a non-null primary key. List parent tables BEFORE referencing children, references point only to an earlier table's primary/unique column of the SAME type. At least one meaningful foreign key. Use safe SQL literals for defaults, or null; checks always []. Answer JSON only.`,
              ),
            ],
            schema: DataModelSchema,
            keys: Object.keys(DataModelSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'database schema',
        ),
      })),
    )
    .addNode('seedStage', async (state) =>
      stage(options, 'seed', async () => {
        const database = requireValue(state.database, 'database schema');
        const seed = requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(
                `STAGE:seed\nCreate realistic sample data for ${state.topic}.\nSchema:\n${renderSchemaOutline(database)}\nAnswer JSON {"tables":[{"table":"<table name>","rows":[{"column":value}]}]}. Include every table, 2-5 rows each, valid keys and cross-table references. INTEGER and NUMERIC values are JSON numbers; BOOLEAN values booleans; DATE/TIMESTAMP/TEXT/VARCHAR are strings. No SQL syntax in values. Answer JSON only.`,
              ),
            ],
            schema: SeedDataSchema,
            keys: Object.keys(SeedDataSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'seed data',
        );
        const smoke = await smokeCheckSql(
          renderDdl(database, state.topic),
          renderSeedScript(seed, database, state.topic),
          database,
        );
        if (smoke.status === 'failed')
          throw new Error(`SQL smoke check: ${smoke.reason}`);
        return { seed };
      }),
    )
    .addNode('codeStage', async (state) =>
      stage(options, 'code', async () => {
        const database = requireValue(state.database, 'database schema');
        const seed = requireValue(state.seed, 'seed data');
        const codePlan = requireAnswer(
          await requestJson({
            model: options.model,
            messages: [
              new HumanMessage(
                `STAGE:code\nPropose 2-12 useful pet-project data operations for ${state.topic}. Schema:\n${renderSchemaOutline(database)}\nReturn JSON {"operations":[{"name":"snake_case","title":"English description","tables":["table"],"parameters":["column"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}]}. Named parameters are :column and each declared parameter must appear in the SQL. No semicolons inside the statement, no comments, no DDL. Mention every table listed in each operation. The TypeScript skeleton is rendered from these checked operations. Answer JSON only.`,
              ),
            ],
            schema: CodePlanSchema,
            keys: Object.keys(CodePlanSchema.shape),
            emptyError: EMPTY_JSON_ERROR,
            corrective: correctiveReply,
            attempts: STAGE_ATTEMPTS,
          }),
          'code plan',
        );
        const smoke = await smokeCheckSql(
          renderDdl(database, state.topic),
          renderSeedScript(seed, database, state.topic),
          database,
          codePlan,
        );
        if (smoke.status === 'failed')
          throw new Error(`Operation SQL: ${smoke.reason}`);
        return { codePlan };
      }),
    )
    .addNode('documentationStage', async (state) =>
      stage(options, 'documentation', async () => {
        const plan = requireValue(state.plan, 'plan');
        const database = requireValue(state.database, 'database schema');
        const seed = requireValue(state.seed, 'seed data');
        const codePlan = requireValue(state.codePlan, 'code plan');
        const ddl = renderDdl(database, state.topic);
        const seedSql = renderSeedScript(seed, database, state.topic);
        const diagram = renderErDiagram(database);
        try {
          renderMermaid(diagram);
        } catch (error) {
          throw new Error(
            `The generated Mermaid ER diagram is invalid: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        const codeFiles = renderCodeFiles({
          plan: codePlan,
          model: database,
          topic: state.topic,
        });
        const smoke = await smokeCheckSql(ddl, seedSql, database, codePlan);
        if (smoke.status === 'failed')
          throw new Error(`SQL smoke check failed: ${smoke.reason}`);
        const readme = renderReadme({
          topic: state.topic,
          plan,
          model: database,
          seed,
          codePlan,
          codeFiles,
          diagram,
          smoke,
        });
        const paths = [
          'assets/ddl/schema.sql',
          'assets/seed/seed.sql',
          'assets/diagrams/er.mmd',
          ...codeFiles.map((file) => `assets/${file.path}`),
        ];
        const issues = lintReadme(readme, paths);
        if (issues.length)
          throw new Error(`Markdown QA failed: ${issues.join('; ')}`);
        return { output: { ddl, seedSql, diagram, codeFiles, readme, smoke } };
      }),
    )
    .addNode('publishStage', async (state) =>
      stage(options, 'publish', async () => {
        const output = requireValue(state.output, 'validated output');
        const files = [
          ['assets/ddl/schema.sql', output.ddl],
          ['assets/seed/seed.sql', output.seedSql],
          ['assets/diagrams/er.mmd', output.diagram],
          ...output.codeFiles.map((file) => [
            `assets/${file.path}`,
            file.content,
          ]),
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
            {
              verdict: 'pass',
              smokeCheck: output.smoke,
              markdownIssues: [],
            },
            null,
            2,
          )}\n`,
          'utf8',
        );
        return {};
      }),
    )
    .addEdge(START, 'planStage')
    .addEdge('planStage', 'schemaStage')
    .addEdge('schemaStage', 'seedStage')
    .addEdge('seedStage', 'codeStage')
    .addEdge('codeStage', 'documentationStage')
    .addEdge('documentationStage', 'publishStage')
    .addEdge('publishStage', END);
}

export async function smokeCheckSql(
  ddl: string,
  seedSql: string,
  model: DataModel,
  codePlan?: CodePlan,
): Promise<z.infer<typeof SmokeSchema>> {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(ddl);
    db.exec(seedSql);
    for (const operation of codePlan?.operations ?? []) {
      db.prepare(operation.statement);
    }
    const rowCounts: Record<string, number> = {};
    for (const table of model.tables) {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table.name}`)
        .get();
      rowCounts[table.name] = typeof row?.count === 'number' ? row.count : 0;
    }
    return { status: 'passed', reason: null, rowCounts };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
      rowCounts: {},
    };
  } finally {
    db.close();
  }
}
