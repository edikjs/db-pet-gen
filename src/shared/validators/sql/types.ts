import type { AST, Select, With } from 'node-sql-parser';

/** PostgreSQL can return a CTE body directly rather than inside `stmt.ast`. */
export interface PostgresBinding extends Pick<With, 'name'> {
  recursive?: boolean;
  stmt: Select | With['stmt'];
}

/** Fields used by the reference visitor. Nested expressions can have other fields. */
export interface SqlNode {
  type?: string;
  ast?: AST;
  with?: PostgresBinding[] | null;
  db?: string | null;
  schema?: string;
  table?: string | object | null;
  value?: string | number | boolean | object | null;
  expr?: string | object | null;
}
