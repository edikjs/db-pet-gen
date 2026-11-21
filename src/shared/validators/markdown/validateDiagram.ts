import mermaid from 'mermaid';
import { isEqual } from 'es-toolkit';
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
  for (const line of lines.filter(isDirective))
    issues.push(`Forbidden Mermaid statement: ${line}`);
  if (source.includes('<') || source.includes('>'))
    issues.push('Mermaid markup is not allowed.');
  return issues;
}

function isDirective(line: string): boolean {
  const [keyword] = line.toLowerCase().split(' ');
  return keyword.startsWith('%%') || FORBIDDEN_STATEMENTS.has(keyword);
}

function keyMarkers(column: DataColumn): readonly string[] {
  const markers = [];
  if (column.primaryKey) markers.push('PK');
  if (column.references) markers.push('FK');
  if (column.unique) markers.push('UK');
  return markers;
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
  const expected = design.tables.map((table) => table.name).sort();
  const actual = [...db.entities.keys()].sort();
  if (!isEqual(actual, expected))
    return ['Diagram entities must match the design tables exactly.'];

  return design.tables.flatMap((table) => {
    const wanted = expectedAttributes(table);
    const found = (db.entities.get(table.name)?.attributes ?? [])
      .map((attribute) =>
        attributeIdentity(attribute.type, attribute.name, attribute.keys),
      )
      .sort();
    return isEqual(wanted, found)
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
    .sort();
  const actual = db.relationships
    .map((relationship) =>
      [
        namesById.get(relationship.entityA) ?? relationship.entityA,
        namesById.get(relationship.entityB) ?? relationship.entityB,
        relationship.roleA,
      ].join('|'),
    )
    .sort();
  return isEqual(actual, expected)
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
