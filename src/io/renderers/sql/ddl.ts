import type { DataIndex, DataModel, DataTable } from '../../../project';
import { separated, Source } from '../shared/source';
import { oneLine, present, when } from '../shared/text';
import { columnBlock, commentSuffix } from './columns';

/** The CREATE TABLE statement of one table. */
function createTable(table: DataTable): string {
  const primaryKey = when(
    table.columns.some((column) => column.primaryKey),
    `  CONSTRAINT pk_${table.name} PRIMARY KEY (${separated(
      table.columns
        .filter((column) => column.primaryKey)
        .map((column) => column.name),
      ', ',
    )})`,
  );
  const checks = table.checks.map(
    (check, index) =>
      `  CONSTRAINT chk_${table.name}_${index + 1} CHECK (${oneLine(check)})`,
  );
  const definitions = table.columns
    .map(columnBlock)
    .concat([primaryKey].filter(present), checks);

  return `CREATE TABLE ${table.name} (\n${separated(definitions, ',\n')}\n);`;
}

/** The CREATE INDEX statement of one index. */
function createIndex(table: DataTable, index: DataIndex): string {
  const unique = when(index.unique, 'UNIQUE ') ?? '';
  return `CREATE ${unique}INDEX ${index.name} ON ${table.name} (${separated(
    index.columns,
    ', ',
  )});`;
}

/** The DDL of the checked schema: tables, constraints and indexes. */
export function renderDdl(model: DataModel, topic: string): string {
  const source = new Source().add([`-- Schema for ${topic}.`]);

  model.tables.forEach((table) => {
    source
      .blank()
      .add([
        `-- Table: ${table.name}${commentSuffix(table.comment)}`,
        createTable(table),
      ]);
    table.indexes.forEach((index) => {
      const comment = when(
        index.comment.length > 0,
        `-- ${oneLine(index.comment)}`,
      );
      source
        .blank()
        .add([comment].filter(present).concat(createIndex(table, index)));
    });
  });

  return `${source}\n`;
}
