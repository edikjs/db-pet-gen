import type { DataColumn, DataModel, DataTable } from '../../../shared';
import { isPlainIdentifier } from '../shared/naming';
import { separated, Source } from '../shared/source';
import { when } from '../shared/text';
import type { ErAttribute, ErDiagram, ErEntity, ErRelationship } from './types';

const MERMAID_TYPES = new Set<DataColumn['type']>([
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'REAL',
  'NUMERIC',
  'TEXT',
  'VARCHAR',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
]);

const KEY_TOKENS: readonly {
  readonly token: string;
  readonly applies: (column: DataColumn) => boolean;
}[] = [
  { token: 'PK', applies: (column) => column.primaryKey },
  { token: 'FK', applies: (column) => column.references !== null },
  { token: 'UK', applies: (column) => column.unique },
];

const PARENT_CARDINALITY: Readonly<Record<string, string>> = {
  required: '||',
  optional: 'o|',
};

const CHILD_CARDINALITY: Readonly<Record<string, string>> = {
  many: 'o{',
  one: 'o|',
};

/** Mermaid-safe names: unsafe tokens are replaced by stable placeholders. */
function safeNames(names: readonly string[], prefix: string): string[] {
  const used = new Set<string>();

  return names.map((name, index) => {
    const base =
      isPlainIdentifier(name) && name !== 'end'
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
function attributes(table: DataTable, names: readonly string[]): ErAttribute[] {
  return table.columns.map((column, index) => ({
    type: MERMAID_TYPES.has(column.type) ? column.type : 'UNKNOWN',
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
): ErRelationship[] {
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
          parent,
          child: tableNames[index],
          column: columnNames[index][columnIndex],
          parentCardinality:
            PARENT_CARDINALITY[column.nullable ? 'optional' : 'required'],
          childCardinality:
            CHILD_CARDINALITY[
              column.unique || (column.primaryKey && solePrimaryKey(table))
                ? 'one'
                : 'many'
            ],
        },
      ];
    }),
  );
}

/** The typed ER diagram built from checked schema data. */
function buildDiagram(model: DataModel): ErDiagram {
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
  const entities: ErEntity[] = model.tables.map((table, index) => ({
    name: tableNames[index],
    attributes: attributes(table, columnNames[index]),
  }));

  return {
    entities,
    relationships: relationships(model, tableNames, columnNames),
  };
}

/** Renders the typed ER diagram as Mermaid source. */
export function renderErDiagram(model: DataModel): string {
  const diagram = buildDiagram(model);
  const source = new Source().append('erDiagram');

  diagram.entities.forEach((entity) => {
    source.append(`    ${entity.name} {`);
    entity.attributes.forEach((attribute) => {
      const keys = separated(attribute.keys, ', ');
      source.append(
        `        ${attribute.type} ${attribute.name}${
          when(keys.length > 0, ` ${keys}`) ?? ''
        }`,
      );
    });
    source.append('    }');
  });
  diagram.relationships.forEach((relationship) => {
    source.append(
      `    ${relationship.parent} ${relationship.parentCardinality}--${relationship.childCardinality} ${relationship.child} : ${relationship.column}`,
    );
  });

  return `${source}\n`;
}
