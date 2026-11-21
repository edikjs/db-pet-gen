import { Parser } from 'node-sql-parser';
import { errorMessage } from '../../utils';

const parser = new Parser();
const DIALECT = { database: 'Postgresql' } as const;

/** The statement kind the parser actually accepted. */
function kind(statement: unknown): string {
  if (
    typeof statement !== 'object' ||
    statement === null ||
    Array.isArray(statement)
  )
    return 'unknown';
  const node = statement as Record<string, unknown>;
  if (node.type === 'create' && typeof node.keyword === 'string')
    return `create ${node.keyword}`;
  return typeof node.type === 'string' ? node.type : 'unknown';
}

/** Parses SQL with the official library and checks only statement kinds. */
function check(
  sql: string,
  label: string,
  allowed: readonly string[],
): string[] {
  try {
    const ast = parser.astify(sql, DIALECT);
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length === 0)
      return [`${label} must contain SQL statements.`];
    return statements.every((statement) => allowed.includes(kind(statement)))
      ? []
      : [`${label} may contain only ${allowed.join(' or ')}.`];
  } catch (error) {
    return [`Invalid ${label}: ${errorMessage(error)}`];
  }
}

/** Checks that the model wrote parseable PostgreSQL DDL statements. */
export function validateDdl(sql: string): string[] {
  return check(sql, 'DDL', ['create table', 'create index']);
}

/** Checks that the model wrote parseable PostgreSQL INSERT statements. */
export function validateSeedSql(sql: string): string[] {
  return check(sql, 'seed SQL', ['insert']);
}
