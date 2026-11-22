import { Parser } from 'node-sql-parser';
import { difference, intersection, union } from 'es-toolkit';
import type { DataModel, Operation, Operations } from '../domain';
import { operationReferences } from './operationReferences';

const parser = new Parser();
const DIALECT = { database: 'Postgresql' } as const;

function parseOperation(statement: string) {
  try {
    const ast = parser.astify(statement, DIALECT);
    const statements = Array.isArray(ast) ? ast : [ast];
    if (
      statements.length !== 1 ||
      !['select', 'insert', 'update', 'delete'].includes(statements[0].type)
    )
      return null;
    return operationReferences(statements[0]);
  } catch {
    return null;
  }
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
  const parsed = parseOperation(operation.statement);
  if (!parsed)
    return [
      `Operation ${operation.name} must contain exactly one parsed SELECT, INSERT, UPDATE or DELETE statement.`,
    ];

  const designTables = model.tables.map((table) => table.name);
  const declared = operation.tables;
  const { tables: mentioned, parameters: used } = parsed;

  return [
    ...violation(
      difference(union(declared, mentioned), designTables),
      operation,
      'names tables absent from the design',
    ),
    ...violation(
      difference(declared, mentioned),
      operation,
      'does not mention all declared tables',
    ),
    ...violation(
      difference(intersection(mentioned, designTables), declared),
      operation,
      'mentions design tables the operation does not declare',
    ),
    ...violation(
      difference(operation.parameters, used),
      operation,
      'declares parameters that are not used in the statement',
    ),
    ...violation(
      difference(used, operation.parameters),
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
