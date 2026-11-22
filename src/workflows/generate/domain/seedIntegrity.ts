import { isEqual, uniqWith } from 'es-toolkit';
import { z } from 'zod';
import {
  columnValues,
  type DataColumn,
  type DataModel,
  type DataTable,
  type SeedData,
} from './database.schema';
import { uniqueKeys } from './designIntegrity';

function seedColumn(
  { type, nullable, references }: DataColumn,
  seed: SeedData,
) {
  let value: z.ZodType = columnValues[type];
  if (references) {
    const parent = seed.tables.find((t) => t.table === references.table);
    const keys = parent?.rows.map((row) => row[references.column]) ?? [];
    value = value.pipe(
      z.literal(keys, {
        error: `no matching seed row in ${references.table}.${references.column}`,
      }),
    );
  }
  return nullable ? value.nullable() : value;
}

function validateRows(
  table: DataTable,
  { rows }: SeedData['tables'][number],
  seed: SeedData,
): string[] {
  const shape = Object.fromEntries(
    table.columns.map((c) => [c.name, seedColumn(c, seed)]),
  );
  const result = z.array(z.strictObject(shape)).safeParse(rows);
  if (!result.success)
    return [`${table.name}: ${z.prettifyError(result.error)}`];
  for (const key of uniqueKeys(table)) {
    // PostgreSQL permits repeated unique keys containing NULL.
    const tuples = rows
      .map((row) => key.map((name) => row[name]))
      .filter((tuple) => !tuple.includes(null));
    if (uniqWith(tuples, isEqual).length !== tuples.length)
      return [`${table.name}: duplicate seed key (${key.join(', ')}).`];
  }
  return [];
}

export function validateSeedData(seed: SeedData, design: DataModel): string[] {
  const expected = design.tables.map((t) => t.name);
  const supplied = seed.tables.map((t) => t.table);
  if (!isEqual(supplied, expected))
    return ['Seed every design table exactly once, in design order.'];
  return design.tables.flatMap((table, i) =>
    validateRows(table, seed.tables[i], seed),
  );
}
