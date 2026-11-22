import { QuoteUtils } from '@pgsql/quotes';
import mermaid from 'mermaid';
import {
  uniqueKeys,
  type DataColumn,
  type DataModel,
  type DataTable,
  type SeedData,
  type SeedValue,
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

function literal(value: SeedValue): string {
  if (value === null) return 'NULL';
  return typeof value === 'string'
    ? QuoteUtils.formatEString(value)
    : String(value);
}

/** Seed integrity guarantees table order, column names and literal types. */
export function renderSeedSql(design: DataModel, seed: SeedData): string {
  return design.tables
    .map(({ name, columns }, i) => {
      const fields = columns.map((c) => `"${c.name}"`).join(', ');
      const tuples = seed.tables[i].rows.map(
        (row) => `(${columns.map((c) => literal(row[c.name])).join(', ')})`,
      );
      return `insert into "${name}" (${fields}) values ${tuples.join(', ')};\n`;
    })
    .join('');
}
