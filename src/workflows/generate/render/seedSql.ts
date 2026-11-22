import { QuoteUtils } from '@pgsql/quotes';
import type { DataModel, SeedData, SeedValue } from '../domain';

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
