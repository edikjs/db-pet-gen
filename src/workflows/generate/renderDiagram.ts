import mermaid from 'mermaid';
import {
  uniqueKeys,
  type DataColumn,
  type DataModel,
  type DataTable,
} from '../../shared';

function attribute(column: DataColumn): string {
  const markers = [
    column.primaryKey && 'PK',
    column.references && 'FK',
    column.unique && 'UK',
  ]
    .filter(Boolean)
    .join(', ');
  return `  ${column.type} \`${column.name}\` ${markers}`.trimEnd();
}

function entity(table: DataTable): string[] {
  return [`"${table.name}" {`, ...table.columns.map(attribute), '}'];
}

function relationships(table: DataTable): string[] {
  const singleKeys = uniqueKeys(table)
    .filter((key) => key.length === 1)
    .flat();
  return table.columns.flatMap(({ name, nullable, references }) => {
    if (!references) return [];
    const parent = nullable ? '|o' : '||';
    const child = singleKeys.includes(name) ? 'o|' : 'o{';
    return [
      `"${references.table}" ${parent}--${child} "${table.name}" : "${name}"`,
    ];
  });
}

export async function renderDiagram({ tables }: DataModel): Promise<string> {
  const source = [
    'erDiagram',
    ...tables.flatMap(entity),
    ...tables.flatMap(relationships),
    '',
  ].join('\n');
  await mermaid.parse(source);
  return source;
}
