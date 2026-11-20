import { camelCase } from 'es-toolkit';
import type { DataColumn, DataModel, DataTable } from '../../../../project';
import { repositoryName, rowTypeName, singular } from '../../shared/naming';
import {
  joinLines,
  objectFields,
  separated,
  Source,
} from '../../shared/source';
import { tsString } from '../../shared/text';
import { tsComment } from './comments';
import { scriptType } from './tsTypes';

interface Binding {
  readonly name: string;
  readonly value: string;
}

/** The columns of the primary key of a table. */
function keyColumns(table: DataTable): readonly DataColumn[] {
  return table.columns.filter((column) => column.primaryKey);
}

/** The column names used in a SELECT or INSERT statement. */
function columnNames(table: DataTable): string[] {
  return table.columns.map((column) => column.name);
}

/** The arguments of a find/delete function. */
function keyArguments(columns: readonly DataColumn[]): string {
  return separated(
    columns.map((column) => `${camelCase(column.name)}: ${scriptType(column)}`),
    ', ',
  );
}

/** The WHERE clause that identifies one row. */
function keyCondition(columns: readonly DataColumn[]): string {
  return separated(
    columns.map((column) => `${column.name} = :${column.name}`),
    ' AND ',
  );
}

/** The bindings of a statement, with one line per named parameter. */
function bindings(
  columns: readonly DataColumn[],
  source: 'argument' | 'row',
): Binding[] {
  return columns.map((column) => ({
    name: column.name,
    value:
      source === 'argument' ? camelCase(column.name) : `row.${column.name}`,
  }));
}

/** One repository: the key queries of one table. */
function repository(table: DataTable): string {
  const row = rowTypeName(table);
  const key = keyColumns(table);
  const names = columnNames(table);
  const select = `SELECT ${separated(names, ', ')} FROM ${table.name}`;
  const arguments_ = keyArguments(key);
  const condition = keyCondition(key);
  const keyBindings = bindings(key, 'argument');
  const subject = singular(table.name).split('_').join(' ');

  return joinLines([
    `/** The rows of the table "${tsComment(table.name)}". */`,
    `export class ${repositoryName(table)} {`,
    '  constructor(private readonly database: Database) {}',
    '',
    '  /** The row of the ' + subject + ' with the given key. */',
    `  findById(${arguments_}): ${row} | undefined {`,
    '    return this.database.get<' + row + '>(',
    `      ${tsString(`${select} WHERE ${condition}`)},`,
    '      {',
    objectFields(keyBindings, '        '),
    '      },',
    '    );',
    '  }',
    '',
    '  /** The rows of the table, at most `limit` of them. */',
    `  list(limit = 50): ${row}[] {`,
    '    return this.database.all<' + row + '>(',
    `      ${tsString(
      `${select} ORDER BY ${separated(
        key.map((column) => column.name),
        ', ',
      )} LIMIT :limit`,
    )},`,
    '      { limit },',
    '    );',
    '  }',
    '',
    '  /** Inserts a row into the table. */',
    `  insert(row: ${row}): void {`,
    '    this.database.run(',
    `      ${tsString(
      `INSERT INTO ${table.name} (${separated(names, ', ')}) VALUES (${separated(
        names.map((name) => `:${name}`),
        ', ',
      )})`,
    )},`,
    '      {',
    objectFields(bindings(table.columns, 'row'), '        '),
    '      },',
    '    );',
    '  }',
    '',
    '  /** Deletes the row with the given key. */',
    `  deleteById(${arguments_}): void {`,
    `    this.database.run(${tsString(`DELETE FROM ${table.name} WHERE ${condition}`)}, {`,
    objectFields(keyBindings, '      '),
    '    });',
    '  }',
    '}',
  ]);
}

/** One repository per table of the checked schema. */
export function repositoriesModule(model: DataModel): string {
  const imports = separated(model.tables.map(rowTypeName).sort(), ', ');
  const repositories = separated(model.tables.map(repository), '\n\n');

  return new Source()
    .add([
      '/** Repositories. */',
      '',
      "import type { Database } from './database';",
      `import type { ${imports} } from './schema';`,
      '',
      repositories,
      '',
    ])
    .toString();
}
