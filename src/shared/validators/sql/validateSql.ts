import { Parser, type AST } from 'node-sql-parser';
import { errorMessage } from '../../utils';
import type { DataModel, SeedData } from '../../schemas';
import { ddlDataIssues, seedDataIssues } from './artifactData';

const parser = new Parser();
const DIALECT = { database: 'Postgresql' } as const;

/** The statement kind the parser actually accepted. */
function kind(statement: AST): string {
  return statement.type === 'create'
    ? `create ${statement.keyword}`
    : statement.type;
}

/** Parses SQL with the official library and checks only statement kinds. */
function check(
  sql: string,
  label: string,
  allowed: readonly string[],
  compare: (statements: AST[]) => string[],
): string[] {
  try {
    const ast = parser.astify(sql, DIALECT);
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length === 0)
      return [`${label} must contain SQL statements.`];
    return statements.every((statement) => allowed.includes(kind(statement)))
      ? compare(statements)
      : [`${label} may contain only ${allowed.join(' or ')}.`];
  } catch (error) {
    return [`Invalid ${label}: ${errorMessage(error)}`];
  }
}

/** Checks that the model wrote parseable PostgreSQL DDL statements. */
export function validateDdl(sql: string, design: DataModel): string[] {
  return check(sql, 'DDL', ['create table', 'create index'], (ast) =>
    ddlDataIssues(ast, design),
  );
}

/** Checks that the model wrote parseable PostgreSQL INSERT statements. */
export function validateSeedSql(sql: string, examples: SeedData): string[] {
  return check(sql, 'seed SQL', ['insert'], (ast) =>
    seedDataIssues(ast, examples),
  );
}
