import type { DataColumn } from '../../../shared';

/** One optional fragment of a column definition. */
export interface ColumnClause {
  readonly applies: (column: DataColumn) => boolean;
  readonly render: (column: DataColumn) => string;
}
