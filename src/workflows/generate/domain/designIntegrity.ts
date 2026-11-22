import type { DataColumn, DataTable } from './database.schema';

export function uniqueKeys({ columns, indexes }: DataTable): string[][] {
  const primaryKey = columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
  const uniqueColumns = columns
    .filter((column) => column.unique)
    .map((column) => [column.name]);
  const uniqueIndexes = indexes
    .filter((index) => index.unique)
    .map((index) => index.columns);
  return [primaryKey, ...uniqueColumns, ...uniqueIndexes];
}

export function distinctNames(names: string[]): boolean {
  return new Set(names).size === names.length;
}

export function distinctRelationNames(tables: DataTable[]): boolean {
  const indexNames = tables.flatMap((table) =>
    table.indexes.map((index) => index.name),
  );
  return distinctNames([...tables.map((table) => table.name), ...indexNames]);
}

function validReference(
  { references, type }: DataColumn,
  parents: DataTable[],
): boolean {
  if (!references) return true;
  const parent = parents.find((table) => table.name === references.table);
  if (!parent) return false;
  const target = parent.columns.find(
    (column) => column.name === references.column,
  );
  if (target?.type !== type) return false;
  // A member of a composite key is not necessarily unique on its own.
  return uniqueKeys(parent).some(
    (key) => key.length === 1 && key[0] === target.name,
  );
}

export function validForeignKeys(tables: DataTable[]): boolean {
  return tables.every((table, index) => {
    const parents = tables.slice(0, index);
    return table.columns.every((column) => validReference(column, parents));
  });
}
