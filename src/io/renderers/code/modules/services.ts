import { camelCase, uniq } from 'es-toolkit';
import type { DataTable } from '../../../../project';
import { rowTypeName } from '../../shared/naming';
import {
  joinLines,
  objectFields,
  separated,
  Source,
} from '../../shared/source';
import { present, tsString, when } from '../../shared/text';
import { analyzeOperation } from '../analysis';
import type { OperationInfo, RenderCodeOptions, ServiceShape } from '../types';
import { tsComment } from './comments';
import { scriptType } from './tsTypes';

const RETURN_TYPES: Record<ServiceShape, (row: string) => string> = {
  nothing: () => 'void',
  rows: (row) => `${row}[]`,
  records: () => 'Record<string, unknown>[]',
};

const RESULT_TYPES: Record<ServiceShape, (row: string) => string> = {
  nothing: () => 'unknown',
  rows: (row) => row,
  records: () => 'Record<string, unknown>',
};

/** True when the operation returns the typed rows of one checked table. */
function hasTypedTable(
  info: OperationInfo,
): info is OperationInfo & { table: DataTable } {
  return info.typedRow && info.table !== undefined;
}

/** The value a service function returns. */
function shapeOf(info: OperationInfo): ServiceShape {
  if (!info.returnsRows) return 'nothing';
  return info.typedRow ? 'rows' : 'records';
}

/** The singular or plural word for a count. */
function countWord(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** One function of the business logic: one operation of the plan. */
function service(info: OperationInfo): string {
  const { operation, statement } = info;
  const shape = shapeOf(info);
  const row = info.table === undefined ? 'unknown' : rowTypeName(info.table);
  const tables = separated(operation.tables.map(tsString), ', ');
  const parameters = ['db: Database'].concat(
    operation.parameters.map((name) => {
      const column = info.columnByParameter.get(name);
      const type = column === undefined ? 'unknown' : scriptType(column);
      return `${camelCase(name)}: ${type}`;
    }),
  );
  const bound = when(
    operation.parameters.length > 0,
    `,\n    {\n${objectFields(
      operation.parameters.map((name) => ({
        name,
        value: camelCase(name),
      })),
      '      ',
    )}\n    }`,
  );
  const binds = when(
    operation.parameters.length > 0,
    ` and binds the parameter${countWord(
      operation.parameters.length,
      '',
      's',
    )} ${separated(operation.parameters.map(tsString), ', ')}`,
  );
  const description = separated(
    [
      `The statement ${info.reads ? 'reads' : 'writes'} the ${countWord(
        operation.tables.length,
        'table',
        'tables',
      )} ${tables}`,
      binds,
      when(!info.reads && info.returnsRows, 'and returns the row it writes'),
    ].filter(present),
    ' ',
  );
  const body =
    shape === 'nothing'
      ? ['  db.run(', `    ${tsString(statement)}${bound ?? ''},`, '  );']
      : [
          `  return db.all<${RESULT_TYPES[shape](row)}>(`,
          `    ${tsString(statement)}${bound ?? ''},`,
          '  );',
        ];

  return joinLines(
    [
      '/**',
      ` * ${tsComment(operation.title)}`,
      ' *',
      ` * ${description}.`,
      ' */',
      `export function ${camelCase(operation.name)}(${separated(
        parameters,
        ', ',
      )}): ${RETURN_TYPES[shape](row)} {`,
    ].concat(body, ['}']),
  );
}

/** Services: one function per checked operation. */
export function servicesModule({ plan, model }: RenderCodeOptions): string {
  const infos = plan.operations.map((operation) =>
    analyzeOperation(operation, model),
  );
  const rowImports = uniq(
    infos.filter(hasTypedTable).map((info) => rowTypeName(info.table)),
  ).sort();
  const schemaImport = when(
    rowImports.length > 0,
    `import type { ${separated(rowImports, ', ')} } from './schema';`,
  );

  return new Source()
    .add([
      '/** Services. */',
      '',
      "import type { Database } from './database';",
      schemaImport ?? '',
      '',
      separated(infos.map(service), '\n\n'),
      '',
    ])
    .toString();
}
