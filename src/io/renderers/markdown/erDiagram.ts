import { toMermaid } from '@jarenjs/mermaid';
import { QuoteUtils } from '@pgsql/quotes';
import type { DataColumn, DataModel, DataTable } from '../../../shared';
import type {
  MermaidErCardinality,
  MermaidErDiagram,
  MermaidErEntity,
  MermaidErKey,
  MermaidErRelationship,
} from './types';

const KEY_TOKENS: readonly {
  readonly token: MermaidErKey;
  readonly applies: (column: DataColumn) => boolean;
}[] = [
  { token: 'PK', applies: (column) => column.primaryKey },
  { token: 'FK', applies: (column) => column.references !== null },
  { token: 'UK', applies: (column) => column.unique },
];

const PARENT_CARDINALITY: Readonly<
  Record<'required' | 'optional', MermaidErCardinality>
> = {
  required: '||',
  optional: 'o|',
};

const CHILD_CARDINALITY: Readonly<
  Record<'many' | 'one', MermaidErCardinality>
> = {
  many: 'o{',
  one: 'o|',
};

/** Mermaid-safe names: unsafe tokens are replaced by stable placeholders. */
function safeNames(names: readonly string[], prefix: string): string[] {
  const used = new Set<string>();

  return names.map((name, index) => {
    const base =
      QuoteUtils.quoteIdentifier(name) === name && name !== 'end'
        ? name
        : `${prefix}_${index + 1}`;
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/** The attributes of one entity, with their key markers. */
function attributes(
  table: DataTable,
  names: readonly string[],
): MermaidErEntity['attributes'] {
  return table.columns.map((column, index) => ({
    type: column.type,
    name: names[index],
    keys: KEY_TOKENS.filter((key) => key.applies(column)).map(
      (key) => key.token,
    ),
  }));
}

/** True when one column alone identifies a row of the table. */
function solePrimaryKey(table: DataTable): boolean {
  return table.columns.filter((column) => column.primaryKey).length === 1;
}

/** The foreign-key relationships of the typed diagram. */
function relationships(
  model: DataModel,
  tableNames: readonly string[],
  columnNames: readonly (readonly string[])[],
): MermaidErRelationship[] {
  const firstTableNames = new Map<string, string>();
  model.tables.forEach((table, index) => {
    if (!firstTableNames.has(table.name)) {
      firstTableNames.set(table.name, tableNames[index]);
    }
  });

  return model.tables.flatMap((table, index) =>
    table.columns.flatMap((column, columnIndex) => {
      const reference = column.references;
      const parent =
        reference === null ? undefined : firstTableNames.get(reference.table);
      if (reference === null || parent === undefined) return [];

      return [
        {
          left: parent,
          right: tableNames[index],
          leftCard:
            PARENT_CARDINALITY[column.nullable ? 'optional' : 'required'],
          rightCard:
            CHILD_CARDINALITY[
              column.unique || (column.primaryKey && solePrimaryKey(table))
                ? 'one'
                : 'many'
            ],
          identifying: true,
          label: columnNames[index][columnIndex],
        },
      ];
    }),
  );
}

/** The typed ER AST built from checked schema data. */
function buildDiagram(model: DataModel): MermaidErDiagram {
  const tableNames = safeNames(
    model.tables.map((table) => table.name),
    'entity',
  );
  const columnNames = model.tables.map((table) =>
    safeNames(
      table.columns.map((column) => column.name),
      'column',
    ),
  );
  const entities: MermaidErEntity[] = model.tables.map((table, index) => ({
    name: tableNames[index],
    attributes: attributes(table, columnNames[index]),
  }));

  return {
    diagram: 'er',
    entities,
    relationships: relationships(model, tableNames, columnNames),
  };
}

/** Renders the typed ER AST as Mermaid source. */
export function renderErDiagram(model: DataModel): string {
  return toMermaid(buildDiagram(model));
}
