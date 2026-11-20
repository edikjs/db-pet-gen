import { keyBy } from 'es-toolkit';
import type {
  DataModel,
  DataTable,
  SeedData,
  SeedValue,
} from '../../../shared';
import { joinLines, separated, Source } from '../shared/source';
import { sqlLiteral } from '../shared/text';

/** The INSERT statement of the rows of one table. */
function insertStatement(
  table: DataTable,
  rows: readonly Record<string, SeedValue>[],
): string {
  const columns = Object.keys(rows[0]);
  const header = `INSERT INTO ${table.name} (${separated(columns, ', ')}) VALUES`;
  const values = separated(
    rows.map(
      (row) =>
        `  (${separated(
          columns.map((column) => sqlLiteral(row[column])),
          ', ',
        )})`,
    ),
    ',\n',
  );
  return joinLines([header, `${values};`]);
}

/** The sample data: one INSERT per table, in the order of the seed data. */
export function renderSeedScript(
  seed: SeedData,
  model: DataModel,
  topic: string,
): string {
  const tables = keyBy(model.tables, (table) => table.name);
  const source = new Source().add([`-- Seed data for ${topic}.`]);

  seed.tables.forEach((entry) => {
    const table = tables[entry.table];
    if (table !== undefined) {
      source.blank().add([insertStatement(table, entry.rows)]);
    }
  });

  return `${source}\n`;
}
