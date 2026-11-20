import { QuoteUtils } from '@pgsql/quotes';
import reservedIdentifiers from 'reserved-identifiers';
import { z } from 'zod';

const jsKeywords = reservedIdentifiers();

const Identifier = z
  .string()
  .min(1)
  .refine(
    (value) =>
      QuoteUtils.quoteIdentifier(value) === value && !jsKeywords.has(value),
    'Identifier must be safe to render unquoted',
  );

const COLUMN_TYPES = [
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
] as const;

const DataColumnSchema = z.object({
  name: Identifier,
  type: z.enum(COLUMN_TYPES),
  primaryKey: z.boolean().default(false),
  nullable: z.boolean().default(true),
  unique: z.boolean().default(false),
  length: z.number().int().positive().nullable().default(null),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean()])
    .nullable()
    .default(null),
  references: z
    .object({ table: Identifier, column: Identifier })
    .nullable()
    .default(null),
  comment: z.string().default(''),
});
export type DataColumn = z.infer<typeof DataColumnSchema>;

const DataIndexSchema = z.object({
  name: Identifier,
  columns: z.array(Identifier).min(1),
  unique: z.boolean().default(false),
  comment: z.string().default(''),
});
export type DataIndex = z.infer<typeof DataIndexSchema>;

const DataTableSchema = z.object({
  name: Identifier,
  comment: z.string().default(''),
  columns: z.array(DataColumnSchema).min(1),
  checks: z.array(z.string()).length(0).default([]),
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

const CodeOperationSchema = z.object({
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
