import type {
  CodeFile,
  CodeOperation,
  CodePlan,
  ColumnType,
  DataColumn,
  DataModel,
  DataTable,
} from '../../../project';
import { CODE_LAYOUT } from './layout';

/**
 * The code skeleton of the pet project, rendered from checked data.
 *
 * The model proposes the operations of the application as data; this module
 * turns them into the files of the skeleton — the connection layer, the
 * schema-access layer, the repositories, the services and the script of the
 * key queries.
 *
 * The rendering is deterministic and reads the schema of the database, so the
 * code and the DDL always agree: every table, every column and every key of
 * the code is the one of the script, and the model never writes a line of the
 * code itself.
 */

/** One file of the code skeleton: its id, its path and its summary. */
export interface CodeFileDescriptor {
  /** Stable id of a generated code file. */
  readonly id: string;
  /** The path of the file inside the assets directory of the run. */
  readonly path: string;
  /** One line: what the file holds — `{topic}` is the project topic. */
  readonly summary: string;
}

/** The files of the code skeleton, in a stable order. */
export const CODE_SKELETON_FILES: readonly CodeFileDescriptor[] = [
  {
    id: 'code_database',
    path: CODE_LAYOUT.database,
    summary: '{topic}: database layer.',
  },
  {
    id: 'code_schema',
    path: CODE_LAYOUT.schema,
    summary: '{topic}: schema.',
  },
  {
    id: 'code_repositories',
    path: CODE_LAYOUT.repositories,
    summary: '{topic}: repositories.',
  },
  {
    id: 'code_services',
    path: CODE_LAYOUT.services,
    summary: '{topic}: services.',
  },
  {
    id: 'code_queries',
    path: CODE_LAYOUT.queries,
    summary: '{topic}: queries.',
  },
];

/**
 * The files of the code skeleton with the topic in their summaries.
 */
export function codeSkeletonFiles(topic: string): CodeFileDescriptor[] {
  return CODE_SKELETON_FILES.map((file) => ({
    ...file,
    summary: file.summary.replace('{topic}', topic),
  }));
}

/**
 * Renders the files of the code skeleton.
 */
export function renderCodeFiles(options: {
  /** The checked plan of the code. */
  readonly plan: CodePlan;
  /** The schema of the database the code works with. */
  readonly model: DataModel;
  /** The topic the application serves. */
  readonly topic: string;
}): CodeFile[] {
  const contents: Record<string, string> = {
    code_database: renderDatabaseModule(),
    code_schema: renderSchemaModule(options.model),
    code_repositories: renderRepositoriesModule(options.model),
    code_services: renderServicesModule(options.plan, options.model),
    code_queries: renderQueriesScript(options.plan),
  };

  return codeSkeletonFiles(options.topic).map((file) => ({
    id: file.id,
    path: file.path,
    summary: file.summary,
    content: contents[file.id] ?? '',
  }));
}

/**
 * Database layer.
 */
function renderDatabaseModule(): string {
  return `/** Database connection. */

import { DatabaseSync } from 'node:sqlite';

/** The value a statement binds. */
export type SqlValue = string | number | boolean | null;

/** The named parameters of a statement. */
export type SqlParams = Record<string, SqlValue>;

/** The database the application works with. */
export interface Database {
  /** The rows a statement returns. */
  all<T>(sql: string, params?: SqlParams): T[];
  /** The first row a statement returns, or undefined when there is none. */
  get<T>(sql: string, params?: SqlParams): T | undefined;
  /** A statement that changes the data. */
  run(sql: string, params?: SqlParams): void;
  /** A script of many statements — the DDL and the sample data of the project. */
  script(sql: string): void;
  /** Closes the connection. */
  close(): void;
}

/** Opens the database. */
export function createDatabase(file = ':memory:'): Database {
  const connection = new DatabaseSync(file);

  return {
    all<T>(sql: string, params?: SqlParams): T[] {
      const statement = connection.prepare(sql);
      return (
        params === undefined ? statement.all() : statement.all(normalize(params))
      ) as T[];
    },
    get<T>(sql: string, params?: SqlParams): T | undefined {
      const statement = connection.prepare(sql);
      return (
        params === undefined ? statement.get() : statement.get(normalize(params))
      ) as T | undefined;
    },
    run(sql: string, params?: SqlParams): void {
      const statement = connection.prepare(sql);
      if (params === undefined) {
        statement.run();
      } else {
        statement.run(normalize(params));
      }
    },
    script(sql: string): void {
      connection.exec(sql);
    },
    close(): void {
      connection.close();
    },
  };
}

/**
 * The values the driver binds: SQLite holds no boolean, so a flag is bound as
 * 1 or 0.
 */
function normalize(params: SqlParams): Record<string, string | number | null> {
  const normalized: Record<string, string | number | null> = {};

  for (const [name, value] of Object.entries(params)) {
    normalized[name] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }

  return normalized;
}
`;
}

/**
 * The schema-access layer: the metadata of the tables and the type of their
 * rows.
 */
function renderSchemaModule(model: DataModel): string {
  const tables = model.tables.map(renderTableMeta).join(',\n');
  const rows = model.tables.map(renderRowType).join('\n\n');

  return `/** Schema metadata. */

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
export const TABLES: readonly TableMeta[] = [
${tables}
];

/** The tables of the database by their names. */
export const SCHEMA: Readonly<Record<string, TableMeta>> = Object.fromEntries(
  TABLES.map((table) => [table.name, table]),
);

${rows}
`;
}

/** The metadata of one table, as the schema module shows it. */
function renderTableMeta(table: DataTable): string {
  const columns = table.columns.map(renderColumnMeta).join(',\n');
  const key = table.columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);

  return `  {
    name: '${table.name}',
    comment: '${escape(table.comment)}',
    primaryKey: [${key.map((name) => `'${name}'`).join(', ')}],
    columns: [
${columns},
    ],
  }`;
}

/** The metadata of one column, as the schema module shows it. */
function renderColumnMeta(column: DataColumn): string {
  const reference =
    column.references === null
      ? ''
      : `,\n        references: { table: '${column.references.table}', column: '${column.references.column}' }`;

  return `      {
        name: '${column.name}',
        type: '${column.type}',
        nullable: ${column.nullable},
        primaryKey: ${column.primaryKey},
        unique: ${column.unique}${reference},
      }`;
}

/** The type of the row of one table, as the schema module shows it. */
function renderRowType(table: DataTable): string {
  const fields = table.columns
    .map(
      (column) =>
        `  /** ${escape(column.comment)} */\n  ${column.name}: ${scriptType(column)};`,
    )
    .join('\n');

  return `/** The row of the table "${table.name}". */
export interface ${rowTypeName(table)} {
${fields}
}`;
}

/**
 * The repositories: one per table of the schema, with the key queries of the
 * table.
 */
function renderRepositoriesModule(model: DataModel): string {
  const imports = model.tables
    .map((table) => rowTypeName(table))
    .sort()
    .join(', ');
  const repositories = model.tables.map(renderRepository).join('\n\n');

  return `/** Repositories. */

import type { Database } from './database';
import type { ${imports} } from './schema';

${repositories}
`;
}

/** One repository: the key queries of one table. */
function renderRepository(table: DataTable): string {
  const row = rowTypeName(table);
  const key = table.columns.filter((column) => column.primaryKey);
  const columns = table.columns.map((column) => column.name);
  const select = `SELECT ${columns.join(', ')} FROM ${table.name}`;
  const keyArguments = key
    .map((column) => `${camelCase(column.name)}: ${scriptType(column)}`)
    .join(', ');
  const keyPlaceholders = key
    .map((column) => `${column.name} = :${column.name}`)
    .join(' AND ');
  const keyEntries = key.map((column) => ({
    name: column.name,
    value: camelCase(column.name),
  }));
  const order = key.map((column) => column.name).join(', ');
  const subject = singular(table.name).replace(/_/gu, ' ');
  const insertEntries = table.columns.map((column) => ({
    name: column.name,
    value: `row.${column.name}`,
  }));

  return `/** The rows of the table "${table.name}". */
export class ${repositoryName(table)} {
  constructor(private readonly database: Database) {}

  /** The row of the ${subject} with the given key. */
  findById(${keyArguments}): ${row} | undefined {
    return this.database.get<${row}>(
      '${select} WHERE ${keyPlaceholders}',
      {
${renderParameters(keyEntries, '        ')}
      },
    );
  }

  /** The rows of the table, at most \`limit\` of them. */
  list(limit = 50): ${row}[] {
    return this.database.all<${row}>(
      '${select} ORDER BY ${order} LIMIT :limit',
      { limit },
    );
  }

  /** Inserts a row into the table. */
  insert(row: ${row}): void {
    this.database.run(
      'INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${columns
        .map((column) => `:${column}`)
        .join(', ')})',
      {
${renderParameters(insertEntries, '        ')}
      },
    );
  }

  /** Deletes the row with the given key. */
  deleteById(${keyArguments}): void {
    this.database.run('DELETE FROM ${table.name} WHERE ${keyPlaceholders}', {
${renderParameters(keyEntries, '      ')}
    });
  }
}`;
}

/**
 * The named parameters of a statement, as the code shows them: one line per
 * parameter, indented as the call of the statement asks.
 */
function renderParameters(
  entries: readonly { readonly name: string; readonly value: string }[],
  indent: string,
): string {
  return entries
    .map((entry) => `${indent}${entry.name}: ${entry.value},`)
    .join('\n');
}

/** Services. */
function renderServicesModule(plan: CodePlan, model: DataModel): string {
  const rows = new Set<string>();
  for (const operation of plan.operations) {
    if (!returnsTableRow(operation)) {
      continue;
    }
    const table = primaryTableOf(operation, model);
    if (table) {
      rows.add(rowTypeName(table));
    }
  }
  const imports = [...rows].sort().join(', ');
  const schemaImport =
    imports.length > 0 ? `import type { ${imports} } from './schema';\n` : '';
  const functions = plan.operations
    .map((operation) => renderService(operation, model))
    .join('\n\n');

  return `/** Services. */

import type { Database } from './database';
${schemaImport}
${functions}
`;
}

/**
 * True when a SELECT returns the rows of one table.
 *
 * A query that joins tables or aggregates its rows returns a shape the schema
 * does not hold as a table: a join combines columns of several tables, and an
 * aggregate returns computed columns (`SUM(...) AS total`). Typing such a
 * result as the row of the first table would make the code claim a shape the
 * statement never returns. The renderer types those results
 * as records, which is true of every query and keeps the code honest.
 */
function returnsTableRow(operation: CodeOperation): boolean {
  const statement = statementOf(operation);
  const keyword = statement.split(/\s+/u)[0]?.toUpperCase() ?? '';
  if (keyword !== 'SELECT') {
    return false;
  }

  return !(
    /\bJOIN\b/iu.test(statement) ||
    /\bGROUP\s+BY\b/iu.test(statement) ||
    /\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(/iu.test(statement)
  );
}

/** One function of the business logic: one operation of the plan. */
function renderService(operation: CodeOperation, model: DataModel): string {
  const table = primaryTableOf(operation, model);
  const row = table ? rowTypeName(table) : 'unknown';
  const statement = statementOf(operation);
  const keyword = statement.split(/\s+/u)[0]?.toUpperCase() ?? '';
  const reads = keyword === 'SELECT';
  // An INSERT with RETURNING returns the row it writes, so the port reads it
  // the same way it reads a SELECT; a plain write returns nothing.
  const returnsRows = reads || /\bRETURNING\b/iu.test(statement);
  const loose = returnsRows && !returnsTableRow(operation);
  const returnType = returnsRows
    ? loose
      ? 'Record<string, unknown>[]'
      : `${row}[]`
    : 'void';
  const resultType = loose ? 'Record<string, unknown>' : row;
  const arguments_ = [
    'db: Database',
    ...operation.parameters.map((parameter) => {
      const column = columnOf(model, operation, parameter);
      const type = column ? scriptType(column) : 'unknown';
      return `${camelCase(parameter)}: ${type}`;
    }),
  ].join(', ');
  const parameters = operation.parameters
    .map((parameter) => `      ${parameter}: ${camelCase(parameter)},`)
    .join('\n');
  const bound =
    operation.parameters.length > 0 ? `,\n    {\n${parameters}\n    }` : '';
  const tables = operation.tables.map((name) => `"${name}"`).join(', ');
  const binds =
    operation.parameters.length > 0
      ? ` and binds the parameter${operation.parameters.length === 1 ? '' : 's'} ${operation.parameters
          .map((parameter) => `"${parameter}"`)
          .join(', ')}`
      : '';
  // A statement that returns rows — a SELECT, or an INSERT with RETURNING —
  // reads them through the port; the row of the table when the statement reads
  // one table, a record when it joins, aggregates or returns the written row.
  // A statement that writes without returning anything returns nothing,
  // because the port of the database has no result.
  const body = returnsRows
    ? `  return db.all<${resultType}>(\n    '${escapeStatement(statement)}'${bound},\n  );`
    : `  db.run(\n    '${escapeStatement(statement)}'${bound},\n  );`;

  return `/**
 * ${escape(operation.title)}
 *
 * The statement ${reads ? 'reads' : 'writes'} the table${operation.tables.length === 1 ? '' : 's'} ${tables}${binds}${!reads && returnsRows ? ' and returns the row it writes' : ''}.
 */
export function ${camelCase(operation.name)}(${arguments_}): ${returnType} {
${body}
}`;
}

/** Queries. */
function renderQueriesScript(plan: CodePlan): string {
  const blocks = plan.operations.map((operation) => {
    const tables = operation.tables.map((name) => `"${name}"`).join(', ');
    const parameters =
      operation.parameters.length > 0
        ? `\n-- Parameters: ${operation.parameters.join(', ')}`
        : '';

    return `-- ${escape(operation.title)}\n-- Tables: ${tables}${parameters}\n${statementOf(operation)};`;
  });

  return `-- Queries.\n\n${blocks.join('\n\n')}
`;
}

/** The statement of an operation, without the trailing semicolon. */
function statementOf(operation: CodeOperation): string {
  const statement = operation.statement.trim();
  return statement.endsWith(';') ? statement.slice(0, -1).trim() : statement;
}

/**
 * The table whose rows the operation returns: the one the statement mentions
 * first. A query that joins two tables returns the rows of the table it reads
 * first, so the type of the row follows the statement.
 */
function primaryTableOf(
  operation: CodeOperation,
  model: DataModel,
): DataTable | undefined {
  const statement = statementOf(operation);

  const tables = operation.tables
    .map((name) => model.tables.find((candidate) => candidate.name === name))
    .filter((table) => table !== undefined);

  return tables.sort(
    (left, right) =>
      firstMention(statement, left.name) - firstMention(statement, right.name),
  )[0];
}

/** Where a statement mentions a table for the first time. */
function firstMention(statement: string, name: string): number {
  const match = new RegExp(`\\b${name}\\b`, 'u').exec(statement);
  return match?.index ?? Number.MAX_SAFE_INTEGER;
}

/** The column of the operation a parameter binds. */
function columnOf(
  model: DataModel,
  operation: CodeOperation,
  parameter: string,
): DataColumn | undefined {
  for (const name of operation.tables) {
    const table = model.tables.find((candidate) => candidate.name === name);
    const column = table?.columns.find(
      (candidate) => candidate.name === parameter,
    );
    if (column) {
      return column;
    }
  }
  return undefined;
}

/** The type of a column in TypeScript. */
function scriptType(column: DataColumn): string {
  const base = SCRIPT_TYPES[column.type];
  return column.nullable ? `${base} | null` : base;
}

/** The TypeScript types of the columns of the schema. */
const SCRIPT_TYPES: Record<ColumnType, string> = {
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

/** The name of the type of the row of a table. */
function rowTypeName(table: DataTable): string {
  return `${pascalCase(singular(table.name))}Row`;
}

/** The name of the repository of a table. */
function repositoryName(table: DataTable): string {
  return `${pascalCase(table.name)}Repository`;
}

/** The singular of a table name — the entity the table holds. */
function singular(name: string): string {
  if (name.endsWith('ies')) {
    return `${name.slice(0, -3)}y`;
  }
  if (/(?:ses|xes|zes|ches|shes)$/u.test(name)) {
    return name.slice(0, -2);
  }
  if (name.endsWith('s') && !name.endsWith('ss')) {
    return name.slice(0, -1);
  }
  return name;
}

/** The name of a column in camelCase — the name of the argument of a function. */
function camelCase(name: string): string {
  return name
    .split('_')
    .filter((part) => part.length > 0)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** The name of a table in PascalCase — the name of its class. */
function pascalCase(name: string): string {
  return name
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** The quotes of a string of the generated code. */
function escape(text: string): string {
  return text
    .replace(/\\/gu, '\\\\')
    .replace(/'/gu, "\\'")
    .replace(/\s+/gu, ' ');
}

/** The quotes of the statement of an operation inside the generated code. */
function escapeStatement(statement: string): string {
  return statement.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'");
}
