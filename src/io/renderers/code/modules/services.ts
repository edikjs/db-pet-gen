import { camelCase } from 'es-toolkit';
import { code, imp, joinCode, literalOf } from 'ts-poet';
import type { Import } from 'ts-poet';
import type { DataColumn } from '../../../../shared';
import { rowTypeName } from '../../shared/naming';
import { analyzeOperation } from '../analysis';
import type { OperationInfo, RenderCodeOptions, ServiceShape } from '../types';
import { scriptType } from './schema';

/** The value a service function returns. */
function shapeOf(info: OperationInfo): ServiceShape {
  if (!info.returnsRows) return 'nothing';
  return info.typedRow ? 'rows' : 'records';
}

/** The checked row type of one operation, when it has one. */
function rowImport(info: OperationInfo): Import | undefined {
  if (!info.typedRow || info.table === undefined) return undefined;
  return imp(`t:${rowTypeName(info.table)}@./schema`);
}

/** The TypeScript type of one operation parameter. */
function parameterType(column: DataColumn | undefined): string {
  return column === undefined ? 'unknown' : scriptType(column);
}

/** The parameters of one service function. */
function parameters(info: OperationInfo) {
  const Database = imp('t:Database@./database');
  const entries = info.operation.parameters.map(
    (name) =>
      code`${camelCase(name)}: ${parameterType(info.columnByParameter.get(name))}`,
  );
  return joinCode([code`db: ${Database}`, ...entries], { on: ', ' });
}

/** The element type of a service that returns rows. */
function elementType(info: OperationInfo, row: Import | undefined) {
  if (shapeOf(info) === 'rows' && row !== undefined) return row;
  return code`Record<string, unknown>`;
}

/** The return type of one service function. */
function returnType(info: OperationInfo, row: Import | undefined) {
  if (shapeOf(info) === 'nothing') return code`void`;
  return code`${elementType(info, row)}[]`;
}

/** The named bindings of one statement, when it has parameters. */
function parameterBindings(info: OperationInfo) {
  const names = info.operation.parameters;
  if (names.length === 0) return undefined;
  return literalOf(
    Object.fromEntries(names.map((name) => [name, code`${camelCase(name)}`])),
  );
}

/** The SQL call that implements one operation. */
function call(info: OperationInfo, row: Import | undefined) {
  const reads = shapeOf(info) !== 'nothing';
  const method = reads ? 'all' : 'run';
  const typeArgument = reads ? code`<${elementType(info, row)}>` : code``;
  const params = parameterBindings(info);
  return params === undefined
    ? code`db.${method}${typeArgument}(${literalOf(info.statement)})`
    : code`db.${method}${typeArgument}(${literalOf(info.statement)}, ${params})`;
}

/** One exported service function, derived from one checked operation. */
function service(info: OperationInfo) {
  const row = rowImport(info);
  const expression = call(info, row);
  const body =
    shapeOf(info) === 'nothing' ? expression : code`return ${expression}`;
  return code`
/** One operation of the checked plan. */
export function ${camelCase(info.operation.name)}(${parameters(info)}): ${returnType(info, row)} {
  ${body};
}
`;
}

/** Services: one function per checked operation of the plan. */
export function servicesModule({ plan, model }: RenderCodeOptions): string {
  const services = plan.operations.map((operation) =>
    service(analyzeOperation(operation, model)),
  );
  return code`
/** Services. */

${joinCode(services, { on: '\n\n' })}
`.toString();
}
