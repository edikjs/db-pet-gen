import mermaid from 'mermaid';
import { collapse } from 'string-collapse-white-space';
import type { DataColumn, DataModel, DataTable } from '../../schemas';
import { errorMessage } from '../../utils';

mermaid.initialize({ startOnLoad: false });

const FORBIDDEN_STATEMENTS = new Set([
  'class',
  'classdef',
  'click',
  'linkstyle',
  'style',
]);
const KEY_MARKERS: readonly {
  readonly token: string;
  readonly applies: (column: DataColumn) => boolean;
}[] = [
  { token: 'PK', applies: (column) => column.primaryKey },
  { token: 'FK', applies: (column) => column.references !== null },
  { token: 'UK', applies: (column) => column.unique },
];

/** The parts of Mermaid's ER parser database used for the design cross-check. */
interface ErAttribute {
  readonly type: string;
  readonly name: string;
  readonly keys: readonly string[];
}

interface ErEntity {
  readonly id: string;
  readonly attributes: readonly ErAttribute[];
}

interface ErRelationship {
  readonly entityA: string;
  readonly entityB: string;
  readonly roleA: string;
}

interface ErDatabase {
  readonly entities: ReadonlyMap<string, ErEntity>;
  readonly relationships: readonly ErRelationship[];
}

/** Lines reduced to one trimmed, single-spaced line each. */
function flatLines(source: string): string[] {
  return source.split('\n').map((line) => collapse(line).result.trim());
}

/** Directives, links and markup the generated README must not carry. */
function forbiddenStatements(source: string): string[] {
  const issues: string[] = [];
  const lines = flatLines(source);
  if (lines[0] !== 'erDiagram')
    issues.push('The diagram must start with erDiagram.');
  for (const line of lines) {
    const head = line.split(' ')[0]?.toLowerCase() ?? '';
    if (head.startsWith('%%') || FORBIDDEN_STATEMENTS.has(head))
      issues.push(`Forbidden Mermaid statement: ${line}`);
  }
  if (source.includes('<') || source.includes('>'))
    issues.push('Mermaid markup is not allowed.');
  return issues;
}

/** The markers a column should carry in an ER diagram, in a stable order. */
function keyMarkers(column: DataColumn): readonly string[] {
  return KEY_MARKERS.filter((key) => key.applies(column))
    .map((key) => key.token)
    .sort();
}

/** A comparable attribute identity, independent of key-marker order. */
function attributeIdentity(
  type: string,
  name: string,
  keys: readonly string[],
): string {
  const sorted = [...keys].sort().join(',');
  return `${type} ${name}${sorted ? ` ${sorted}` : ''}`;
}

/** The attributes a table should have, sorted for order-free comparison. */
function expectedAttributes(table: DataTable): string[] {
  return table.columns
    .map((column) =>
      attributeIdentity(column.type, column.name, keyMarkers(column)),
    )
    .sort();
}

/** Entity names and attributes must be exactly the design's tables and columns. */
function checkEntities(db: ErDatabase, design: DataModel): readonly string[] {
  const entities = [...db.entities];
  const expected = design.tables
    .map((table) => table.name)
    .sort()
    .join('|');
  const actual = entities
    .map(([name]) => name)
    .sort()
    .join('|');
  if (actual !== expected)
    return ['Diagram entities must match the design tables exactly.'];

  const entitiesByName = new Map(entities);
  return design.tables.flatMap((table) => {
    const wanted = expectedAttributes(table).join('|');
    const found = (entitiesByName.get(table.name)?.attributes ?? [])
      .map((attribute) =>
        attributeIdentity(attribute.type, attribute.name, attribute.keys),
      )
      .sort()
      .join('|');
    return wanted === found
      ? []
      : [
          `Entity ${table.name} must list every column with its design type and key markers.`,
        ];
  });
}

/** Relationships must be one per design foreign key, labelled by its column. */
function checkRelationships(
  db: ErDatabase,
  design: DataModel,
): readonly string[] {
  const namesById = new Map(
    [...db.entities].map(([name, entity]) => [entity.id, name]),
  );
  const expected = design.tables
    .flatMap((table) =>
      table.columns
        .filter((column) => column.references !== null)
        .map(
          (column) =>
            `${column.references?.table}|${table.name}|${column.name}`,
        ),
    )
    .sort()
    .join('|');
  const actual = db.relationships
    .map((relationship) =>
      [
        namesById.get(relationship.entityA) ?? relationship.entityA,
        namesById.get(relationship.entityB) ?? relationship.entityB,
        relationship.roleA,
      ].join('|'),
    )
    .sort()
    .join('|');
  return actual === expected
    ? []
    : ['Diagram relationships must match the design foreign keys.'];
}

/**
 * Checks model-written Mermaid against the real Mermaid grammar and the
 * checked design. Returns violations for the model's corrective retry loop.
 */
export async function validateDiagram(
  source: string,
  design: DataModel,
): Promise<string[]> {
  const issues = [...forbiddenStatements(source)];

  let db: ErDatabase;
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    if (diagram.type !== 'er') {
      issues.push('The diagram must be an ER diagram.');
      return issues;
    }
    db = diagram.db as unknown as ErDatabase;
  } catch (error) {
    issues.push(`Invalid Mermaid: ${errorMessage(error)}`);
    return issues;
  }

  return [
    ...issues,
    ...checkEntities(db, design),
    ...checkRelationships(db, design),
  ];
}
