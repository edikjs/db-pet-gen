import { isPlainObject } from 'es-toolkit';
import type { AST } from 'node-sql-parser';
import type { PostgresBinding, SqlNode } from './types';

/** Inspect the PostgreSQL AST, keeping WITH names local to their query. */
export function operationReferences(statement: AST) {
  const tables = new Set<string>();
  const parameters = new Set<string>();
  const noCtes = new Set<string>();

  function visitWith(bindings: PostgresBinding[], outer: ReadonlySet<string>) {
    const scope = new Set(outer);
    // WITH RECURSIVE makes all sibling names visible in their definitions.
    if (bindings.some((binding) => binding.recursive)) {
      for (const binding of bindings) scope.add(binding.name.value);
    }
    for (const binding of bindings) {
      visit(binding.stmt, scope);
      scope.add(binding.name.value);
    }
    return scope;
  }

  function visit(node: SqlNode, outer: ReadonlySet<string>): void {
    const scope = node.with ? visitWith(node.with, outer) : outer;

    if (node.type === 'param' && typeof node.value === 'string') {
      parameters.add(node.value);
    }
    if (node.type === 'into') {
      const name = isPlainObject(node.expr) ? node.expr.value : node.expr;
      if (typeof name === 'string') tables.add(name);
    }
    // Relation nodes have a db field; column qualifiers and aliases do not.
    if ('db' in node && typeof node.table === 'string') {
      const name = [node.db, node.schema, node.table].filter(Boolean).join('.');
      if (!scope.has(node.table) || node.db != null) tables.add(name);
    }
    for (const [field, child] of Object.entries(node)) {
      if (field === 'with') continue;
      // A DML target is a physical table even when a CTE shadows its name.
      if (Array.isArray(child)) {
        child
          .filter(isPlainObject)
          .forEach((item) => visit(item, field === 'table' ? noCtes : scope));
      } else if (isPlainObject(child)) {
        visit(child, scope);
      }
    }
  }

  visit(statement, noCtes);
  return { tables: [...tables], parameters: [...parameters] };
}
