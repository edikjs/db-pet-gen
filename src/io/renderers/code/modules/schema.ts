import { code, joinCode, literalOf } from 'ts-poet';
import type { DataColumn, DataModel, DataTable } from '../../../../shared';
import { rowTypeName } from '../../shared/naming';
import { oneLine } from '../../shared/text';

/** The TypeScript type of each checked SQL column type. */
const COLUMN_TYPES: Record<DataColumn['type'], string> = {
  INTEGER: 'number',
  BIGINT: 'number',
  SMALLINT: 'number',
  REAL: 'number',
  NUMERIC: 'number',
  TEXT: 'string',
  VARCHAR: 'string',
  BOOLEAN: 'boolean',
  DATE: 'string',
  TIMESTAMP: 'string',
};

/** The nullable TypeScript type of a checked column. */
export function scriptType(column: DataColumn): string {
  const base = COLUMN_TYPES[column.type];
  return column.nullable ? `${base} | null` : base;
}

/** The metadata object of one column, without an absent reference field. */
function columnMetadata(column: DataColumn) {
  const { references } = column;
  return {
    name: column.name,
    type: column.type,
    nullable: column.nullable,
    primaryKey: column.primaryKey,
    unique: column.unique,
    ...(references === null
      ? {}
      : { references: { table: references.table, column: references.column } }),
  };
}

/** The metadata object of one table. */
function tableMetadata(table: DataTable) {
  return {
    name: table.name,
    comment: oneLine(table.comment),
    primaryKey: table.columns
      .filter((column) => column.primaryKey)
      .map((column) => column.name),
    columns: table.columns.map(columnMetadata),
  };
}

/** The row interface of one table. */
function rowInterface(table: DataTable) {
  const fields = table.columns.map(
    (column) => code`${column.name}: ${scriptType(column)};`,
  );

  return code`
/** The row of a checked table. */
export interface ${rowTypeName(table)} {
  ${joinCode(fields, { on: '\n' })}
}
`;
}

/** Schema metadata and the row types derived from the checked schema. */
export function schemaModule(model: DataModel): string {
  const metadata = model.tables.map(tableMetadata);
  const rows = model.tables.map(rowInterface);

  return code`
/** Schema metadata. */

/** One column of a table. */
export interface ColumnMeta {
  /** The name of the column. */
  readonly name: string;
  /** The type of the column. */
  readonly type: string;
  /** True when the column may hold null. */
  readonly nullable: boolean;
  /** True when the column is a part of the primary key. */
  readonly primaryKey: boolean;
  /** True when the column holds no duplicates. */
  readonly unique: boolean;
  /** The table and the column the column points at, when it is a foreign key. */
  readonly references?: { readonly table: string; readonly column: string };
}

/** One table of the database. */
export interface TableMeta {
  /** The name of the table. */
  readonly name: string;
  /** What the table holds. */
  readonly comment: string;
  /** The columns of the table. */
  readonly columns: readonly ColumnMeta[];
  /** The columns of the primary key. */
  readonly primaryKey: readonly string[];
}

/** The tables of the database. */
export const TABLES: readonly TableMeta[] = ${literalOf(metadata)};

/** The tables of the database by their names. */
export const SCHEMA: Readonly<Record<string, TableMeta>> = Object.fromEntries(
  TABLES.map((table) => [table.name, table]),
);

${joinCode(rows, { on: '\n\n' })}
`.toString();
}
