import { camelCase } from 'es-toolkit';
import { code, imp, joinCode, literalOf } from 'ts-poet';
import type { DataColumn, DataModel, DataTable } from '../../../../shared';
import { repositoryName, rowTypeName } from '../../shared/naming';
import { separated } from '../../shared/source';
import { scriptType } from './schema';

/** The columns of the primary key of a table. */
function keyColumns(table: DataTable): readonly DataColumn[] {
  return table.columns.filter((column) => column.primaryKey);
}

/** The column names used in a SELECT or INSERT statement. */
function columnNames(table: DataTable): string[] {
  return table.columns.map((column) => column.name);
}

/** The arguments of a find/delete function. */
function keyArguments(columns: readonly DataColumn[]) {
  return joinCode(
    columns.map(
      (column) => code`${camelCase(column.name)}: ${scriptType(column)}`,
    ),
    { on: ', ' },
  );
}

/** The WHERE clause that identifies one row. */
function keyCondition(columns: readonly DataColumn[]): string {
  return separated(
    columns.map((column) => `${column.name} = :${column.name}`),
    ' AND ',
  );
}

/** The bindings of a statement, with one named parameter per column. */
function bindings(columns: readonly DataColumn[], source: 'argument' | 'row') {
  return literalOf(
    Object.fromEntries(
      columns.map((column) => [
        column.name,
        code`${source === 'argument' ? camelCase(column.name) : `row.${column.name}`}`,
      ]),
    ),
  );
}

/** One repository: the key queries of one table. */
function repository(table: DataTable) {
  const Database = imp('t:Database@./database');
  const Row = imp(`t:${rowTypeName(table)}@./schema`);
  const key = keyColumns(table);
  const names = columnNames(table);
  const select = `SELECT ${separated(names, ', ')} FROM ${table.name}`;
  const arguments_ = keyArguments(key);
  const condition = keyCondition(key);
  const keyBindings = bindings(key, 'argument');
  const rowBindings = bindings(table.columns, 'row');
  const order = separated(
    key.map((column) => column.name),
    ', ',
  );

  return code`
/** The key queries of one checked table. */
export class ${repositoryName(table)} {
  constructor(private readonly database: ${Database}) {}

  /** Finds one row by its key. */
  findById(${arguments_}): ${Row} | undefined {
    return this.database.get<${Row}>(
      ${literalOf(`${select} WHERE ${condition}`)},
      ${keyBindings},
    );
  }

  /** The rows of the table, at most \`limit\` of them. */
  list(limit = 50): ${Row}[] {
    return this.database.all<${Row}>(
      ${literalOf(`${select} ORDER BY ${order} LIMIT :limit`)},
      { limit },
    );
  }

  /** Inserts a row into the table. */
  insert(row: ${Row}): void {
    this.database.run(
      ${literalOf(
        `INSERT INTO ${table.name} (${separated(names, ', ')}) VALUES (${separated(
          names.map((name) => `:${name}`),
          ', ',
        )})`,
      )},
      ${rowBindings},
    );
  }

  /** Deletes the row with the given key. */
  deleteById(${arguments_}): void {
    this.database.run(${literalOf(`DELETE FROM ${table.name} WHERE ${condition}`)}, ${keyBindings});
  }
}
`;
}

/** One repository per table of the checked schema. */
export function repositoriesModule(model: DataModel): string {
  const repositories = model.tables.map(repository);

  return code`
/** Repositories. */

${joinCode(repositories, { on: '\n\n' })}
`.toString();
}
