import type { DataModel } from '../../../project';
import { Source } from '../shared/source';
import { columnOutline, commentSuffix } from './columns';

/** A readable schema outline: the tables, their columns and their keys. */
export function renderSchemaOutline(model: DataModel): string {
  const source = new Source();

  model.tables.forEach((table) => {
    source.append(`- ${table.name}${commentSuffix(table.comment)}`);
    table.columns.forEach((column) => {
      source.append(`  - ${columnOutline(column)}`);
    });
  });

  return source.toString();
}
