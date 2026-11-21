import { QuoteUtils } from '@pgsql/quotes';
import reservedIdentifiers from 'reserved-identifiers';
import { z } from 'zod';
import {
  validForeignKeys,
  distinctNames,
  distinctRelationNames,
} from './designIntegrity';

const jsKeywords = reservedIdentifiers();

const Identifier = z
  .string()
  .min(1)
  .refine(
    (value) =>
      QuoteUtils.quoteIdentifier(value) === value && !jsKeywords.has(value),
    'Identifier must be safe to render unquoted',
  );

export const columnValues = {
  INTEGER: z.int(),
  BIGINT: z.int(),
  SMALLINT: z.int(),
  REAL: z.number(),
  NUMERIC: z.number(),
  TEXT: z.string(),
  VARCHAR: z.string(),
  BOOLEAN: z.boolean(),
  DATE: z.string(),
  TIMESTAMP: z.string(),
};

const DataColumnSchema = z
  .object({
    name: Identifier,
    type: z.object(columnValues).keyof(),
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
  })
  .refine(
    (column) => !column.primaryKey || !column.nullable,
    'Primary key columns cannot be nullable.',
  );
export type DataColumn = z.infer<typeof DataColumnSchema>;

const DataIndexSchema = z.object({
  name: Identifier,
  columns: z
    .array(Identifier)
    .min(1)
    .refine(distinctNames, 'Duplicate index column.'),
  unique: z.boolean().default(false),
  comment: z.string().default(''),
});
export type DataIndex = z.infer<typeof DataIndexSchema>;

const DataTableSchema = z
  .object({
    name: Identifier,
    comment: z.string().default(''),
    columns: z
      .array(DataColumnSchema)
      .refine(
        (columns) => columns.some((column) => column.primaryKey),
        'A table needs a primary key.',
      )
      .refine(
        (columns) => distinctNames(columns.map((column) => column.name)),
        'Duplicate column name.',
      ),
    checks: z.array(z.string()).length(0).default([]),
    indexes: z.array(DataIndexSchema).default([]),
  })
  .refine(({ columns, indexes }) => {
    const names = new Set(columns.map((column) => column.name));
    const indexed = indexes.flatMap((index) => index.columns);
    return indexed.every((name) => names.has(name));
  }, 'Index columns must exist in their table.');
export type DataTable = z.infer<typeof DataTableSchema>;

export const DataModelSchema = z.object({
  tables: z
    .array(DataTableSchema)
    .min(2)
    .max(8)
    .refine(distinctRelationNames, 'Duplicate table or index name.')
    .refine(
      (tables) =>
        tables.some((table) =>
          table.columns.some((column) => column.references),
        ),
      'The design requires at least one foreign key.',
    )
    .refine(
      validForeignKeys,
      'Foreign keys must reference an earlier, individually unique column of the same type.',
    ),
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
          .min(2)
          .max(5),
      }),
    )
    .min(2),
});
export type SeedData = z.infer<typeof SeedDataSchema>;
export type SeedValue = string | number | boolean | null;

const OperationSchema = z.object({
  name: Identifier,
  title: z.string().min(1),
  tables: z.array(Identifier).min(1),
  parameters: z.array(Identifier).default([]),
  statement: z.string().min(1),
});
export type Operation = z.infer<typeof OperationSchema>;

/** The checked example operations documented in the generated README. */
export const OperationsSchema = z.object({
  operations: z.array(OperationSchema).min(2).max(12),
});
export type Operations = z.infer<typeof OperationsSchema>;
