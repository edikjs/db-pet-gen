import { isEqual } from 'es-toolkit';
import { Parser, type AST } from 'node-sql-parser';
import { z } from 'zod';
import { errorMessage } from '../../../shared';
import type { DataModel } from '../domain';

const parser = new Parser();

// The PostgreSQL dialect differs from the parser's generic AST types.
const column = z
  .object({
    resource: z.literal('column'),
    column: z.object({
      column: z.object({ expr: z.object({ value: z.string() }) }),
    }),
    definition: z.object({ dataType: z.string() }),
  })
  .transform((node) => ({
    name: node.column.column.expr.value,
    type: node.definition.dataType,
  }));
const table = z
  .object({
    keyword: z.literal('table'),
    table: z.tuple([z.object({ db: z.null(), table: z.string() })]),
    create_definitions: z.array(
      z.union([column, z.object({ resource: z.literal('constraint') })]),
    ),
  })
  .transform((node) => ({
    name: node.table[0].table,
    columns: node.create_definitions.filter((item) => 'name' in item),
  }));

function ddlDataIssues(statements: AST[], design: DataModel): string[] {
  const parsed = z
    .array(z.union([table, z.object({ keyword: z.literal('index') })]))
    .safeParse(statements);
  const expected = design.tables.map(({ name, columns }) => ({
    name,
    columns: columns.map(({ name, type }) => ({ name, type })),
  }));
  if (
    parsed.success &&
    isEqual(
      parsed.data.filter((item) => 'name' in item),
      expected,
    )
  )
    return [];
  return ['DDL tables, column names and types must match the design in order.'];
}

export function validateDdl(sql: string, design: DataModel): string[] {
  try {
    const ast = parser.astify(sql, { database: 'Postgresql' });
    const statements = Array.isArray(ast) ? ast : [ast];
    if (!statements.length) return ['DDL must contain SQL statements.'];
    if (
      !statements.every(
        (s) => s.type === 'create' && ['table', 'index'].includes(s.keyword),
      )
    )
      return ['DDL may contain only create table or create index.'];
    return ddlDataIssues(statements, design);
  } catch (error) {
    return [`Invalid DDL: ${errorMessage(error)}`];
  }
}
