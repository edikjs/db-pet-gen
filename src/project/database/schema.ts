import { z } from 'zod';

const RESERVED_IDENTIFIERS = new Set([
  'all',
  'and',
  'as',
  'by',
  'class',
  'constructor',
  'default',
  'delete',
  'end',
  'export',
  'false',
  'from',
  'function',
  'group',
  'import',
  'index',
  'insert',
  'interface',
  'join',
  'key',
  'limit',
  'new',
  'not',
  'null',
  'on',
  'or',
  'order',
  'primary',
  'references',
  'return',
  'select',
  'table',
  'true',
  'update',
  'user',
  'where',
]);
export const Identifier = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .refine(
    (value) => !RESERVED_IDENTIFIERS.has(value),
    'Reserved SQL or TypeScript identifier',
  );
export const ColumnTypeSchema = z.enum([
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'REAL',
  'NUMERIC',
  'TEXT',
  'VARCHAR',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
]);
export type ColumnType = z.infer<typeof ColumnTypeSchema>;

export const DataColumnSchema = z.object({
  name: Identifier,
  type: ColumnTypeSchema,
  primaryKey: z.boolean().default(false),
  nullable: z.boolean().default(true),
  unique: z.boolean().default(false),
  length: z.number().int().positive().nullable().default(null),
  defaultValue: z.string().nullable().default(null),
  references: z
    .object({ table: Identifier, column: Identifier })
    .nullable()
    .default(null),
  comment: z.string().default(''),
});
export type DataColumn = z.infer<typeof DataColumnSchema>;

export const DataIndexSchema = z.object({
  name: Identifier,
  columns: z.array(Identifier).min(1),
  unique: z.boolean().default(false),
  comment: z.string().default(''),
});
export type DataIndex = z.infer<typeof DataIndexSchema>;

export const DataTableSchema = z.object({
  name: Identifier,
  comment: z.string().default(''),
  columns: z.array(DataColumnSchema).min(1),
  checks: z.array(z.string()).default([]),
  indexes: z.array(DataIndexSchema).default([]),
});
export type DataTable = z.infer<typeof DataTableSchema>;

export const DataModelSchema = z.object({
  tables: z.array(DataTableSchema).min(2).max(8),
});
export type DataModel = z.infer<typeof DataModelSchema>;

export const SeedDataSchema = z.object({
  tables: z
    .array(
      z.object({
        table: Identifier,
        rows: z
          .array(
            z.record(
              z.string(),
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            ),
          )
          .min(1),
      }),
    )
    .min(2),
});
export type SeedData = z.infer<typeof SeedDataSchema>;
export type SeedValue = string | number | boolean | null;

export const CodeOperationSchema = z.object({
  name: Identifier,
  title: z.string().min(1),
  tables: z.array(Identifier).min(1),
  parameters: z.array(Identifier).default([]),
  statement: z.string().min(1),
});
export type CodeOperation = z.infer<typeof CodeOperationSchema>;
export const CodePlanSchema = z.object({
  operations: z.array(CodeOperationSchema).min(2).max(12),
});
export type CodePlan = z.infer<typeof CodePlanSchema>;
export interface CodeFile {
  id: string;
  path: string;
  summary: string;
  content: string;
}

const DEFAULT_LITERAL =
  /^-?\d+(\.\d+)?$|^'([^']|'')*'$|^(TRUE|FALSE|NULL|CURRENT_TIMESTAMP|CURRENT_DATE)$/i;

export function verifyDataModel(model: DataModel): string[] {
  const issues: string[] = [];
  const names = new Set<string>();
  const indexes = new Set<string>();
  let foreignKeys = 0;
  for (const table of model.tables) {
    if (names.has(table.name)) issues.push(`Duplicate table ${table.name}`);
    const columns = new Set<string>();
    if (!table.comment.trim()) issues.push(`Describe table ${table.name}`);
    if (!table.columns.some((column) => column.primaryKey))
      issues.push(`Missing primary key: ${table.name}`);
    if (table.checks.length)
      issues.push(`CHECK expressions are not supported: ${table.name}`);
    for (const column of table.columns) {
      if (columns.has(column.name))
        issues.push(`Duplicate column ${table.name}.${column.name}`);
      columns.add(column.name);
      if (column.primaryKey && column.nullable)
        issues.push(
          `Primary key must not be nullable: ${table.name}.${column.name}`,
        );
      if (column.type !== 'VARCHAR' && column.length !== null)
        issues.push(
          `Length only applies to VARCHAR: ${table.name}.${column.name}`,
        );
      if (
        column.defaultValue !== null &&
        !DEFAULT_LITERAL.test(column.defaultValue.trim())
      ) {
        issues.push(`Unsafe default: ${table.name}.${column.name}`);
      }
      if (column.references) {
        foreignKeys += 1;
        const referenced = model.tables.find(
          (candidate) => candidate.name === column.references?.table,
        );
        const target = referenced?.columns.find(
          (candidate) => candidate.name === column.references?.column,
        );
        if (
          !target ||
          !(target.primaryKey || target.unique) ||
          target.type !== column.type
        ) {
          issues.push(`Invalid foreign key: ${table.name}.${column.name}`);
        }
        if (!names.has(column.references.table)) {
          issues.push(
            `List the referenced table before ${table.name}: ${column.references.table}`,
          );
        }
      }
    }
    for (const index of table.indexes) {
      if (indexes.has(index.name)) issues.push(`Duplicate index ${index.name}`);
      indexes.add(index.name);
      if (index.columns.some((column) => !columns.has(column)))
        issues.push(`Unknown index column: ${index.name}`);
    }
    names.add(table.name);
  }
  if (foreignKeys === 0)
    issues.push('The schema needs at least one relationship (foreign key).');
  return issues;
}

export function verifySeedData(seed: SeedData, model: DataModel): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const order = new Map(
    model.tables.map((table, index) => [table.name, index]),
  );
  let previous = -1;
  for (const entry of seed.tables) {
    if (seen.has(entry.table))
      issues.push(`Duplicate seed table: ${entry.table}`);
    seen.add(entry.table);
    const table = model.tables.find(
      (candidate) => candidate.name === entry.table,
    );
    if (!table) {
      issues.push(`Unknown seed table: ${entry.table}`);
      continue;
    }
    const position = order.get(entry.table) ?? -1;
    if (position < previous)
      issues.push(`Seed tables must follow schema order: ${entry.table}`);
    previous = position;
    const keys = new Set<string>();
    for (const row of entry.rows) {
      for (const name of Object.keys(row)) {
        if (!table.columns.some((column) => column.name === name))
          issues.push(`Unknown column: ${entry.table}.${name}`);
      }
      for (const column of table.columns) {
        const value = row[column.name];
        if (
          (value === undefined || value === null) &&
          !column.nullable &&
          column.defaultValue === null
        ) {
          issues.push(`Missing required value: ${entry.table}.${column.name}`);
        }
        if (
          value !== undefined &&
          value !== null &&
          !validValue(column.type, value)
        ) {
          issues.push(`Wrong value type: ${entry.table}.${column.name}`);
        }
        if (column.references && value !== undefined && value !== null) {
          const parent = seed.tables.find(
            (candidate) => candidate.table === column.references?.table,
          );
          if (
            !parent?.rows.some(
              (candidate) =>
                String(candidate[column.references!.column]) === String(value),
            )
          ) {
            issues.push(
              `Unresolved foreign key: ${entry.table}.${column.name}`,
            );
          }
        }
      }
      const key = JSON.stringify(
        table.columns
          .filter((column) => column.primaryKey)
          .map((column) => row[column.name]),
      );
      if (keys.has(key)) issues.push(`Duplicate primary key: ${entry.table}`);
      keys.add(key);
    }
  }
  for (const table of model.tables)
    if (!seen.has(table.name)) issues.push(`Missing seed table: ${table.name}`);
  return issues;
}

function validValue(
  type: ColumnType,
  value: string | number | boolean,
): boolean {
  if (['INTEGER', 'BIGINT', 'SMALLINT'].includes(type))
    return typeof value === 'number' && Number.isSafeInteger(value);
  if (['REAL', 'NUMERIC'].includes(type))
    return typeof value === 'number' && Number.isFinite(value);
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  return typeof value === 'string';
}

export function verifyCodePlan(plan: CodePlan, model: DataModel): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const operation of plan.operations) {
    if (seen.has(operation.name))
      issues.push(`Duplicate operation: ${operation.name}`);
    seen.add(operation.name);
    if (new Set(operation.tables).size !== operation.tables.length)
      issues.push(`Repeated table: ${operation.name}`);
    const tables = operation.tables.map((name) =>
      model.tables.find((table) => table.name === name),
    );
    if (tables.some((table) => !table))
      issues.push(`Unknown table: ${operation.name}`);
    const sql = operation.statement.trim().replace(/;$/u, '');
    if (
      !/^(SELECT|INSERT|UPDATE|DELETE)\b/iu.test(sql) ||
      /;|--|\/\*/u.test(sql)
    ) {
      issues.push(`Invalid SQL statement: ${operation.name}`);
    }
    for (const name of operation.tables) {
      if (!new RegExp(`\\b${name}\\b`, 'iu').test(sql))
        issues.push(`SQL omits table ${name}: ${operation.name}`);
    }
    for (const table of model.tables) {
      if (
        new RegExp(`\\b${table.name}\\b`, 'iu').test(sql) &&
        !operation.tables.includes(table.name)
      ) {
        issues.push(`SQL uses unlisted table ${table.name}: ${operation.name}`);
      }
    }
    const allowed = tables.flatMap(
      (table) => table?.columns.map((column) => column.name) ?? [],
    );
    const parameters = [...sql.matchAll(/:([a-z][a-z0-9_]*)/gu)].map(
      (match) => match[1],
    );
    if (new Set(operation.parameters).size !== operation.parameters.length)
      issues.push(`Duplicate parameter: ${operation.name}`);
    if (/^(?:DELETE|UPDATE)\b/iu.test(sql) && !/\bWHERE\b/iu.test(sql))
      issues.push(`Write operation needs a WHERE clause: ${operation.name}`);
    for (const parameter of operation.parameters) {
      if (!allowed.includes(parameter) || !parameters.includes(parameter))
        issues.push(`Invalid parameter ${parameter}: ${operation.name}`);
    }
    for (const parameter of parameters)
      if (!operation.parameters.includes(parameter))
        issues.push(`Undeclared parameter ${parameter}: ${operation.name}`);
  }
  return issues;
}
