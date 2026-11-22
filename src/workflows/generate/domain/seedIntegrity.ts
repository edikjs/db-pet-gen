import { isEqual, uniqWith } from 'es-toolkit';
import { z } from 'zod';
import {
  seedValue,
  type DataColumn,
  type DataModel,
  type DataTable,
  type SeedData,
} from './database.schema';
import { uniqueKeys } from './designIntegrity';

type SeedTable = SeedData['tables'][number];

function columnSchema(column: DataColumn, seed: SeedData) {
  const base = seedValue(column);
  const reference = column.references;

  if (!reference) return column.nullable ? base.nullable() : base;

  const { table, column: parentColumn } = reference;
  const parent = seed.tables.find((item) => item.table === table);
  const allowed = parent?.rows.map((row) => row[parentColumn]) ?? [];
  const checked = z.pipe(
    base,
    z.literal(
      allowed.filter((value) => value !== null),
      { error: `no matching seed row in ${table}.${parentColumn}` },
    ),
  );
  return column.nullable ? checked.nullable() : checked;
}

function rowSchema(table: DataTable, seed: SeedData) {
  const shape = Object.fromEntries(
    table.columns.map((column) => [column.name, columnSchema(column, seed)]),
  );
  return z.array(z.strictObject(shape));
}

function duplicateKeyProblems(table: DataTable, rows: SeedTable['rows']) {
  return uniqueKeys(table).flatMap((key) => {
    const values = rows
      .map((row) => key.map((name) => row[name]))
      .filter((tuple) => !tuple.includes(null));
    return uniqWith(values, isEqual).length === values.length
      ? []
      : [`${table.name}: duplicate seed key (${key.join(', ')}).`];
  });
}

export function validateSeedData(seed: SeedData, design: DataModel) {
  const expected = design.tables.map(({ name }) => name);
  const supplied = seed.tables.map(({ table }) => table);
  if (!isEqual(supplied, expected))
    return ['Seed every design table exactly once, in design order.'];

  return design.tables.flatMap((table, index) => {
    const { rows } = seed.tables[index];
    const result = rowSchema(table, seed).safeParse(rows);
    const issues = result.success
      ? []
      : [`${table.name}: ${z.prettifyError(result.error)}`];
    return [...issues, ...duplicateKeyProblems(table, rows)];
  });
}
