import { renderErDiagram } from '../erDiagram';
import type { ReadmeContext, ReadmeInput, Relationship } from '../types';

/** The declared foreign keys, described with their cardinalities. */
function relationships(input: ReadmeInput): Relationship[] {
  return input.model.tables.flatMap((table) => {
    const solePrimaryKey =
      table.columns.filter((column) => column.primaryKey).length === 1;

    return table.columns.flatMap((column) => {
      const reference = column.references;
      if (reference === null) return [];

      return [
        {
          child: table.name,
          column: column.name,
          parent: reference.table,
          parentColumn: reference.column,
          optional: column.nullable,
          atMostOne: column.unique || (column.primaryKey && solePrimaryKey),
        },
      ];
    });
  });
}

/** Everything the README sections need, derived once from checked data. */
export function readmeContext(input: ReadmeInput): ReadmeContext {
  const generated = renderErDiagram(input.model);

  return {
    input,
    diagram: input.diagram === generated ? input.diagram : generated,
    relationships: relationships(input),
    seedCounts: new Map(
      input.seed.tables.map((entry) => [entry.table, entry.rows.length]),
    ),
  };
}
