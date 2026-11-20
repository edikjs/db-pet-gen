import type { CodeFile } from '../../../../project';
import { renderErDiagram } from '../erDiagram';
import type {
  CodeLink,
  ReadmeContext,
  ReadmeInput,
  Relationship,
} from '../types';

const ASSETS = 'assets/';
const CODE = 'assets/code/';

/** A code file path is linked only when it stays inside the code assets. */
function codePath(file: CodeFile): string | undefined {
  const path = file.path.startsWith(ASSETS)
    ? file.path
    : `${ASSETS}${file.path}`;
  const safe =
    path.startsWith(CODE) && (path.endsWith('.ts') || path.endsWith('.sql'));
  return safe ? path : undefined;
}

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
  const links: CodeLink[] = input.codeFiles.map((file) => ({
    file,
    path: codePath(file),
  }));

  return {
    input,
    diagram: input.diagram === generated ? input.diagram : generated,
    links,
    queriesPath: links.find((link) => link.path?.endsWith('/queries.sql'))
      ?.path,
    relationships: relationships(input),
    seedCounts: new Map(
      input.seed.tables.map((entry) => [entry.table, entry.rows.length]),
    ),
  };
}
