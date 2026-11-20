import type { DataColumn } from '../../../shared';
import { concatenated, joinLines, separated } from '../shared/source';
import { oneLine, present, when } from '../shared/text';
import type { ColumnClause } from './types';

/** Fragments appended to a column inside a CREATE TABLE statement. */
const DDL_CLAUSES: readonly ColumnClause[] = [
  {
    applies: (column) => column.type === 'VARCHAR' && column.length !== null,
    render: (column) => `(${column.length})`,
  },
  {
    applies: (column) => !column.nullable || column.primaryKey,
    render: () => ' NOT NULL',
  },
  {
    applies: (column) => column.unique && !column.primaryKey,
    render: () => ' UNIQUE',
  },
  {
    applies: (column) => column.defaultValue !== null,
    render: (column) => ` DEFAULT ${column.defaultValue}`,
  },
  {
    applies: (column) => column.references !== null,
    render: (column) => {
      const reference = column.references;
      return reference === null
        ? ''
        : ` REFERENCES ${reference.table} (${reference.column})`;
    },
  },
];

/** Flags of a column in the human-readable schema outline. */
const OUTLINE_FLAGS: readonly ColumnClause[] = [
  { applies: (column) => column.primaryKey, render: () => 'PRIMARY KEY' },
  { applies: (column) => !column.nullable, render: () => 'NOT NULL' },
  { applies: (column) => column.unique, render: () => 'UNIQUE' },
  {
    applies: (column) => column.references !== null,
    render: (column) => {
      const reference = column.references;
      return reference === null
        ? ''
        : `REFERENCES ${reference.table}(${reference.column})`;
    },
  },
  {
    applies: (column) => column.comment.length > 0,
    render: (column) => `— ${oneLine(column.comment)}`,
  },
];

/** The definition of one column inside a CREATE TABLE statement. */
export function columnDefinition(column: DataColumn): string {
  const clauses = DDL_CLAUSES.filter((clause) => clause.applies(column)).map(
    (clause) => clause.render(column),
  );
  return `${column.name} ${column.type}${concatenated(clauses)}`;
}

/**
 * The definition of one column with its comment above it. A trailing comment
 * would swallow the comma that separates the columns.
 */
export function columnBlock(column: DataColumn): string {
  return joinLines(
    [
      when(column.comment.length > 0, `  -- ${oneLine(column.comment)}`),
      `  ${columnDefinition(column)}`,
    ].filter(present),
  );
}

/** One column of the schema, as the outline of the prompt shows it. */
export function columnOutline(column: DataColumn): string {
  const type =
    column.type === 'VARCHAR' && column.length !== null
      ? `${column.type}(${column.length})`
      : column.type;
  const flags = OUTLINE_FLAGS.filter((clause) => clause.applies(column)).map(
    (clause) => clause.render(column),
  );
  return separated([column.name, type].concat(flags), ' ');
}

/** The comment of a table or of a column, as a trailing annotation. */
export function commentSuffix(comment: string): string {
  return when(comment.length > 0, ` — ${oneLine(comment)}`) ?? '';
}
