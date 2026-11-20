import { keyBy } from 'es-toolkit';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresQueryCompiler,
  sql,
} from 'kysely';
import type {
  DataColumn,
  DataIndex,
  DataModel,
  DataTable,
  SeedData,
} from '../../../shared';

/**
 * PostgreSQL SQL compiled from checked data by Kysely.
 *
 * Model answers never supply SQL text: identifiers go through `sql.ref`, values
 * through `sql.lit`, and the remaining keywords through `sql.raw` from checked
 * enums and integers. A DummyDriver compiles without opening a connection.
 */

const db = new Kysely<Record<string, never>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: () => {
      throw new Error('The SQL compiler does not introspect a database');
    },
  },
});

const COLUMN_TYPES: Record<Exclude<DataColumn['type'], 'VARCHAR'>, string> = {
  INTEGER: 'integer',
  BIGINT: 'bigint',
  SMALLINT: 'smallint',
  REAL: 'real',
  NUMERIC: 'numeric',
  TEXT: 'text',
  BOOLEAN: 'boolean',
  DATE: 'date',
  TIMESTAMP: 'timestamp',
};

/** The PostgreSQL type of one checked column. */
function columnType(column: DataColumn): string {
  if (column.type === 'VARCHAR') {
    return column.length === null ? 'varchar' : `varchar(${column.length})`;
  }
  return COLUMN_TYPES[column.type];
}

/** One compiled statement, terminated so it can stand alone in a script. */
function statement(expression: {
  compile(db: Kysely<Record<string, never>>): { sql: string };
}): string {
  return `${expression.compile(db).sql};\n`;
}

/** The clauses of one column definition. */
function columnClauses(column: DataColumn) {
  const clauses = [sql.raw(columnType(column))];
  if (!column.nullable || column.primaryKey) {
    clauses.push(sql.raw('not null'));
  }
  if (column.unique && !column.primaryKey) {
    clauses.push(sql.raw('unique'));
  }
  if (column.defaultValue !== null) {
    clauses.push(sql`default ${sql.lit(column.defaultValue)}`);
  }
  return clauses;
}

/** The CREATE TABLE statement of one table. */
function createTable(table: DataTable): string {
  const definitions = table.columns.map((column) => {
    const clauses = [sql.ref(column.name), ...columnClauses(column)];
    return sql`${sql.join(clauses, sql` `)}`;
  });
  const primaryKey = table.columns
    .filter((column) => column.primaryKey)
    .map((column) => sql.ref(column.name));
  const constraints = [
    ...(primaryKey.length > 0
      ? [
          sql`constraint ${sql.ref(`pk_${table.name}`)} primary key (${sql.join(primaryKey, sql`, `)})`,
        ]
      : []),
    ...table.columns
      .filter((column) => column.references !== null)
      .map((column) => {
        const reference = column.references;
        if (reference === null) {
          throw new Error(
            `Missing foreign key of ${table.name}.${column.name}`,
          );
        }
        return sql`constraint ${sql.ref(`fk_${table.name}_${column.name}`)} foreign key (${sql.ref(column.name)}) references ${sql.ref(reference.table)} (${sql.ref(reference.column)})`;
      }),
  ];
  const parts = [...definitions, ...constraints];

  return statement(
    sql`create table ${sql.ref(table.name)} (${sql.join(parts, sql`, `)})`,
  );
}

/** The CREATE INDEX statement of one index. */
function createIndex(table: DataTable, index: DataIndex): string {
  const columns = index.columns.map((name) => sql.ref(name));
  const columnsSql = sql.join(columns, sql`, `);
  return statement(
    index.unique
      ? sql`create unique index ${sql.ref(index.name)} on ${sql.ref(table.name)} (${columnsSql})`
      : sql`create index ${sql.ref(index.name)} on ${sql.ref(table.name)} (${columnsSql})`,
  );
}

/** The DDL of the checked schema: tables, constraints and indexes. */
export function renderDdl(model: DataModel): string {
  return model.tables
    .flatMap((table) => [
      createTable(table),
      ...table.indexes.map((index) => createIndex(table, index)),
    ])
    .join('');
}

/** The INSERT statement of the rows of one table. */
function insertStatement(
  table: DataTable,
  rows: SeedData['tables'][number]['rows'],
): string {
  const columns = Object.keys(rows[0]);
  const names = columns.map((name) => sql.ref(name));
  const values = rows.map(
    (row) =>
      sql`(${sql.join(
        columns.map((name) => sql.lit(row[name] ?? null)),
        sql`, `,
      )})`,
  );
  return statement(
    sql`insert into ${sql.ref(table.name)} (${sql.join(names, sql`, `)}) values ${sql.join(values, sql`, `)}`,
  );
}

/** The sample data: one INSERT per table, in the order of the seed data. */
export function renderSeedScript(seed: SeedData, model: DataModel): string {
  const tables = keyBy(model.tables, (table) => table.name);
  return seed.tables
    .flatMap((entry) => {
      const table = tables[entry.table];
      return table === undefined ? [] : [insertStatement(table, entry.rows)];
    })
    .join('');
}
