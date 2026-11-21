import { Parser } from 'node-sql-parser';
import type { DataModel, Operation, Operations } from '../../schemas';

const parser = new Parser();
const DIALECT = { database: 'Postgresql' } as const;
const STATEMENT_KINDS: readonly string[] = [
  'select',
  'insert',
  'update',
  'delete',
];

/** True when the parser reports one of the statement kinds this project allows. */
function isAllowedStatement(statement: string): boolean {
  try {
    const ast = parser.astify(statement, DIALECT);
    const root = (Array.isArray(ast) ? ast[0] : ast) as { type?: unknown };
    return (
      typeof root?.type === 'string' && STATEMENT_KINDS.includes(root.type)
    );
  } catch {
    return false;
  }
}

/** The tables a statement mentions, without the parser's operation prefix. */
function mentionedTables(statement: string): string[] {
  try {
    return parser.tableList(statement, DIALECT).map((entry) => {
      const separator = entry.lastIndexOf('::');
      return separator < 0 ? entry : entry.slice(separator + 2);
    });
  } catch {
    return [];
  }
}

/** The columns available to an operation's declared tables. */
function declaredColumns(operation: Operation, model: DataModel): Set<string> {
  const names = new Set(operation.tables);
  return new Set(
    model.tables
      .filter((table) => names.has(table.name))
      .flatMap((table) => table.columns.map((column) => column.name)),
  );
}

function rejectWhen(
  invalid: readonly string[],
  operation: Operation,
  problem: string,
): void {
  if (invalid.length > 0)
    throw new Error(
      `Operation ${operation.name} ${problem}: ${invalid.join(', ')}.`,
    );
}

/** Checks one model-supplied statement against the checked design. */
function validateOperation(operation: Operation, model: DataModel): void {
  if (!isAllowedStatement(operation.statement))
    throw new Error(
      `Operation ${operation.name} is not a parsed SELECT, INSERT, UPDATE or DELETE statement.`,
    );

  const tables = new Set(model.tables.map((table) => table.name));
  rejectWhen(
    operation.tables.filter((name) => !tables.has(name)),
    operation,
    'names tables absent from the design',
  );

  const mentioned = new Set(mentionedTables(operation.statement));
  rejectWhen(
    operation.tables.filter((name) => !mentioned.has(name)),
    operation,
    'does not mention all declared tables',
  );

  const columns = declaredColumns(operation, model);
  rejectWhen(
    operation.parameters.filter((name) => !columns.has(name)),
    operation,
    'declares parameters that are not columns of its tables',
  );
}

/** Fails the validation stage when an example operation is not trustworthy SQL. */
export function validateOperations(
  operations: Operations,
  model: DataModel,
): void {
  operations.operations.forEach((operation) =>
    validateOperation(operation, model),
  );
}
