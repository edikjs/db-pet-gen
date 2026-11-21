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

/** True when the parser accepts only the statement kinds this project allows. */
function isAllowedStatement(statement: string): boolean {
  try {
    const ast = parser.astify(statement, DIALECT);
    const statements = Array.isArray(ast) ? ast : [ast];
    return (
      statements.length > 0 &&
      statements.every((node) => {
        const root = node as { type?: unknown };
        return (
          typeof root?.type === 'string' && STATEMENT_KINDS.includes(root.type)
        );
      })
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

/** Named parameters found in the parsed statement. */
function statementParameters(statement: string): Set<string> {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as Record<string, unknown>;
    if (node.type === 'param' && typeof node.value === 'string')
      names.add(node.value);
    Object.values(node).forEach(visit);
  };
  visit(parser.astify(statement, DIALECT));
  return names;
}

/** One grouped violation for a nonempty list of invalid names. */
function violation(
  invalid: readonly string[],
  operation: Operation,
  problem: string,
): string[] {
  return invalid.length > 0
    ? [`Operation ${operation.name} ${problem}: ${invalid.join(', ')}.`]
    : [];
}

/** Checks one model-supplied statement against the checked design. */
function operationViolations(operation: Operation, model: DataModel): string[] {
  if (!isAllowedStatement(operation.statement))
    return [
      `Operation ${operation.name} is not a parsed SELECT, INSERT, UPDATE or DELETE statement.`,
    ];

  const designTables = new Set(model.tables.map((table) => table.name));
  const declared = new Set(operation.tables);
  const mentioned = new Set(mentionedTables(operation.statement));
  const used = statementParameters(operation.statement);

  return [
    ...violation(
      operation.tables.filter((name) => !designTables.has(name)),
      operation,
      'names tables absent from the design',
    ),
    ...violation(
      operation.tables.filter((name) => !mentioned.has(name)),
      operation,
      'does not mention all declared tables',
    ),
    ...violation(
      [...mentioned].filter(
        (name) => designTables.has(name) && !declared.has(name),
      ),
      operation,
      'mentions design tables the operation does not declare',
    ),
    ...violation(
      operation.parameters.filter((name) => !used.has(name)),
      operation,
      'declares parameters that are not used in the statement',
    ),
    ...violation(
      [...used].filter((name) => !operation.parameters.includes(name)),
      operation,
      'uses parameters that are not declared',
    ),
  ];
}

/** Returns the violations that keep a model-written operation from being used. */
export function validateOperations(
  operations: Operations,
  model: DataModel,
): string[] {
  return operations.operations.flatMap((operation) =>
    operationViolations(operation, model),
  );
}
