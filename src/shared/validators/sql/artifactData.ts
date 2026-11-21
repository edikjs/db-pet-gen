import { isEqual } from 'es-toolkit';
import type { AST } from 'node-sql-parser';
import { z } from 'zod';
import type { DataModel, SeedData } from '../../schemas';

// The PostgreSQL dialect has a different AST shape from the parser's
// generic TypeScript declarations. Validate the subset we compare.
const target = z.tuple([z.object({ db: z.null(), table: z.string() })]);
const identifier = z.object({ value: z.string() });
const column = z
  .object({
    resource: z.literal('column'),
    column: z.object({ column: z.object({ expr: identifier }) }),
    definition: z.object({ dataType: z.string() }),
  })
  .transform((node) => ({
    name: node.column.column.expr.value,
    type: node.definition.dataType,
  }));
const table = z
  .object({
    keyword: z.literal('table'),
    table: target,
    create_definitions: z.array(
      z.union([column, z.object({ resource: z.literal('constraint') })]),
    ),
  })
  .transform((node) => ({
    name: node.table[0].table,
    columns: node.create_definitions.filter((item) => 'name' in item),
  }));

export function ddlDataIssues(statements: AST[], design: DataModel): string[] {
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

const literal = z.union([
  z.object({ type: z.literal('number'), value: z.coerce.number() }),
  z.object({
    type: z.literal('single_quote_string'),
    value: z.string().transform((s) => s.replaceAll("''", "'")),
  }),
  z.object({ type: z.literal('bool'), value: z.boolean() }),
  z.object({ type: z.literal('null'), value: z.null() }),
]);
const insert = z
  .strictObject({
    type: z.literal('insert'),
    table: target,
    columns: z.array(identifier),
    values: z.object({
      type: z.literal('values'),
      values: z.array(
        z.object({ type: z.literal('expr_list'), value: z.array(literal) }),
      ),
    }),
    partition: z.null(),
    conflict: z.null(),
    returning: z.null(),
  })
  .refine(
    (node) =>
      new Set(node.columns.map(({ value }) => value)).size ===
        node.columns.length &&
      node.values.values.every(
        (row) => row.value.length === node.columns.length,
      ),
  )
  .transform((node) => ({
    table: node.table[0].table,
    rows: node.values.values.map((row) =>
      Object.fromEntries(
        row.value.map(({ value }, i) => [node.columns[i].value, value]),
      ),
    ),
  }));

export function seedDataIssues(
  statements: AST[],
  examples: SeedData,
): string[] {
  const parsed = z.array(insert).safeParse(statements);
  if (parsed.success && isEqual(parsed.data, examples.tables)) return [];
  return [
    'Seed SQL must insert exactly the declared tables, columns and literal row values in order.',
  ];
}
