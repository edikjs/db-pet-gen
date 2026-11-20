import type { DataColumn } from '../../../../project';

/** The TypeScript type of a checked column. */
const COLUMN_TYPES: Record<DataColumn['type'], string> = {
  INTEGER: 'number',
  BIGINT: 'number',
  SMALLINT: 'number',
  REAL: 'number',
  NUMERIC: 'number',
  TEXT: 'string',
  VARCHAR: 'string',
  BOOLEAN: 'boolean',
  DATE: 'string',
  TIMESTAMP: 'string',
};

/** The nullable TypeScript type of a checked column. */
export function scriptType(column: DataColumn): string {
  const base = COLUMN_TYPES[column.type];
  return column.nullable ? `${base} | null` : base;
}
