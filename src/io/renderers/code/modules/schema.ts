import type { DataColumn, DataModel, DataTable } from '../../../../project';
import {
  joinLines,
  objectFields,
  separated,
  Source,
} from '../../shared/source';
import { rowTypeName } from '../../shared/naming';
import { oneLine, present, tsString } from '../../shared/text';
import { tsComment } from './comments';
import { scriptType } from './tsTypes';

/** The optional foreign key of one column. */
function referenceField(column: DataColumn) {
  const reference = column.references;
  return reference === null
    ? undefined
    : {
        name: 'references',
        value: `{ table: ${tsString(reference.table)}, column: ${tsString(
          reference.column,
        )} }`,
      };
}

/** The metadata of one column, as the schema module shows it. */
function columnMeta(column: DataColumn): string {
  const reference = referenceField(column);
  const fields = [
    { name: 'name', value: tsString(column.name) },
    { name: 'type', value: tsString(column.type) },
    { name: 'nullable', value: String(column.nullable) },
    { name: 'primaryKey', value: String(column.primaryKey) },
    { name: 'unique', value: String(column.unique) },
  ].concat([reference].filter(present));

  return joinLines(['      {', objectFields(fields, '        '), '      }']);
}

/** The metadata of one table, as the schema module shows it. */
function tableMeta(table: DataTable): string {
  const columns = separated(table.columns.map(columnMeta), ',\n');
  const key = separated(
    table.columns
      .filter((column) => column.primaryKey)
      .map((column) => tsString(column.name)),
    ', ',
  );

  return joinLines([
    '  {',
    `    name: ${tsString(table.name)},`,
    `    comment: ${tsString(oneLine(table.comment))},`,
    `    primaryKey: [${key}],`,
    '    columns: [',
    columns,
    '    ],',
    '  }',
  ]);
}

/** The row type of one table, as the schema module shows it. */
function rowType(table: DataTable): string {
  const fields = separated(
    table.columns.map(
      (column) =>
        `  /** ${tsComment(column.comment)} */\n  ${column.name}: ${scriptType(column)};`,
    ),
    '\n',
  );

  return joinLines([
    `/** The row of the table "${tsComment(table.name)}". */`,
    `export interface ${rowTypeName(table)} {`,
    fields,
    '}',
  ]);
}

/** Schema metadata and the row types derived from the checked schema. */
export function schemaModule(model: DataModel): string {
  const tables = separated(model.tables.map(tableMeta), ',\n');
  const rows = separated(model.tables.map(rowType), '\n\n');

  return new Source()
    .add([
      '/** Schema metadata. */',
      '',
      '/** One column of a table. */',
      'export interface ColumnMeta {',
      '  /** The name of the column. */',
      '  readonly name: string;',
      '  /** The type of the column. */',
      '  readonly type: string;',
      '  /** True when the column may hold null. */',
      '  readonly nullable: boolean;',
      '  /** True when the column is a part of the primary key. */',
      '  readonly primaryKey: boolean;',
      '  /** True when the column holds no duplicates. */',
      '  readonly unique: boolean;',
      '  /** The table and the column the column points at, when it is a foreign key. */',
      '  readonly references?: { readonly table: string; readonly column: string };',
      '}',
      '',
      '/** One table of the database. */',
      'export interface TableMeta {',
      '  /** The name of the table. */',
      '  readonly name: string;',
      '  /** What the table holds. */',
      '  readonly comment: string;',
      '  /** The columns of the table. */',
      '  readonly columns: readonly ColumnMeta[];',
      '  /** The columns of the primary key. */',
      '  readonly primaryKey: readonly string[];',
      '}',
      '',
      '/** The tables of the database. */',
      'export const TABLES: readonly TableMeta[] = [',
      tables,
      '];',
      '',
      '/** The tables of the database by their names. */',
      'export const SCHEMA: Readonly<Record<string, TableMeta>> = Object.fromEntries(',
      '  TABLES.map((table) => [table.name, table]),',
      ');',
      '',
      rows,
      '',
    ])
    .toString();
}
