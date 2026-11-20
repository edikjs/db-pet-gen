import { isPlainObject, keyBy } from 'es-toolkit';
import sqlParser from 'node-sql-parser';
import type {
  CodeOperation,
  DataColumn,
  DataModel,
  DataTable,
} from '../../../shared';
import type { OperationInfo, StatementKind } from './types';

const parser = new sqlParser.Parser();
const DIALECT = { database: 'Postgresql' } as const;

/** Removes the trailing semicolon so the statement can be embedded in code. */
function cleanStatement(statement: string): string {
  const trimmed = statement.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
}

/** The parsed root of a checked statement, when the parser understands it. */
function statementNode(
  statement: string,
): Record<PropertyKey, unknown> | undefined {
  try {
    const ast = parser.astify(statement, DIALECT);
    const root = Array.isArray(ast) ? ast[0] : ast;
    return isPlainObject(root)
      ? (root as unknown as Record<PropertyKey, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Finds a node type in a parsed SQL tree without textual guessing. */
function hasNode(root: unknown, type: string): boolean {
  const queue: unknown[] = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!isPlainObject(node)) continue;
    if (node.type === type) return true;
    Object.values(node).forEach((child) => queue.push(child));
  }
  return false;
}

function statementKind(
  node: Record<PropertyKey, unknown> | undefined,
): StatementKind {
  if (node === undefined || typeof node.type !== 'string') return 'unknown';
  const kinds: readonly StatementKind[] = [
    'select',
    'insert',
    'update',
    'delete',
  ];
  return kinds.find((kind) => kind === node.type) ?? 'unknown';
}

/** The table names of a statement, in the order in which it mentions them. */
function mentionedTables(statement: string): string[] {
  try {
    return parser.tableList(statement, DIALECT).map((entry) => {
      const alias = entry.lastIndexOf('::');
      return alias < 0 ? entry : entry.slice(alias + 2);
    });
  } catch {
    return [];
  }
}

/** The table whose rows the statement reads first. */
function primaryTable(
  statement: string,
  model: DataModel,
): DataTable | undefined {
  const tables = keyBy(model.tables, (table) => table.name);
  return mentionedTables(statement)
    .map((name) => tables[name])
    .find((table) => table !== undefined);
}

/** The column each declared parameter binds. */
function parameterColumns(
  operation: CodeOperation,
  model: DataModel,
): Map<string, DataColumn> {
  const tables = keyBy(model.tables, (table) => table.name);
  const columns = keyBy(
    operation.tables.flatMap((name) => tables[name]?.columns ?? []),
    (column) => column.name,
  );
  const bound = new Map<string, DataColumn>();
  operation.parameters.forEach((name) => {
    const column = columns[name];
    if (column !== undefined) bound.set(name, column);
  });
  return bound;
}

/** True when a SELECT returns only the columns of one checked table. */
function isSimpleSelect(
  node: Record<PropertyKey, unknown> | undefined,
  kind: StatementKind,
): boolean {
  if (kind !== 'select') return false;
  const from = node?.from;
  const groupBy = node?.groupby;
  const multipleTables = Array.isArray(from) && from.length > 1;
  const grouped = groupBy !== null && groupBy !== undefined;
  return (
    !multipleTables &&
    !grouped &&
    !hasNode(node, 'join') &&
    !hasNode(node, 'aggr_func')
  );
}

/** Derives all rendering decisions of one operation from checked data. */
export function analyzeOperation(
  operation: CodeOperation,
  model: DataModel,
): OperationInfo {
  const statement = cleanStatement(operation.statement);
  const node = statementNode(statement);
  const kind = statementKind(node);
  const reads = kind === 'select';
  const returnsRows = reads || hasNode(node, 'returning');

  return {
    operation,
    statement,
    kind,
    reads,
    returnsRows,
    typedRow: isSimpleSelect(node, kind),
    table: primaryTable(statement, model),
    columnByParameter: parameterColumns(operation, model),
  };
}
