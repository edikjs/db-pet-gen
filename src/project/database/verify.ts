import { countBy, difference, keyBy, uniq } from 'es-toolkit';
import sqlParser from 'node-sql-parser';
import { isRecord } from '../../utils';
import type { CodePlan, DataColumn, DataModel, SeedData } from './schema';

const DIALECT = { database: 'Postgresql' } as const;
const STATEMENT_TYPES = ['select', 'insert', 'update', 'delete'];
const DEFAULT_KEYWORDS = [
  'true',
  'false',
  'null',
  'current_timestamp',
  'current_date',
];

const parser = new sqlParser.Parser();

function duplicates(values: string[]): string[] {
  return Object.entries(countBy(values, (value) => value))
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isNumberLiteral(value: string): boolean {
  let index = value[0] === '-' ? 1 : 0;
  const wholeStart = index;
  while (isDigit(value[index])) {
    index += 1;
  }
  if (index === wholeStart) {
    return false;
  }
  if (value[index] !== '.') {
    return index === value.length;
  }
  index += 1;
  const fractionStart = index;
  while (isDigit(value[index])) {
    index += 1;
  }
  return index > fractionStart && index === value.length;
}

function isQuotedLiteral(value: string): boolean {
  const last = value.length - 1;
  if (last < 1 || value[0] !== "'" || value[last] !== "'") {
    return false;
  }
  let index = 1;
  while (index < last) {
    if (value[index] !== "'") {
      index += 1;
      continue;
    }
    if (value[index + 1] !== "'") {
      return false;
    }
    index += 2;
  }
  return true;
}

function isSafeDefault(value: string): boolean {
  if (DEFAULT_KEYWORDS.includes(value.toLowerCase())) {
    return true;
  }
  return isNumberLiteral(value) || isQuotedLiteral(value);
}

function validValue(
  type: DataColumn['type'],
  value: string | number | boolean,
): boolean {
  if (type === 'INTEGER' || type === 'BIGINT' || type === 'SMALLINT') {
    return typeof value === 'number' && Number.isSafeInteger(value);
  }
  if (type === 'REAL' || type === 'NUMERIC') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (type === 'BOOLEAN') {
    return typeof value === 'boolean';
  }
  return typeof value === 'string';
}

export function verifyDataModel(model: DataModel): string[] {
  const issues: string[] = [];
  const tableNames = model.tables.map((table) => table.name);
  const tables = keyBy(model.tables, (table) => table.name);
  const order = new Map(tableNames.map((name, index) => [name, index]));

  issues.push(
    ...duplicates(tableNames).map((name) => `Duplicate table ${name}`),
  );
  const indexNames = model.tables.flatMap((table) =>
    table.indexes.map((index) => index.name),
  );
  issues.push(
    ...duplicates(indexNames).map((name) => `Duplicate index ${name}`),
  );

  let foreignKeys = 0;
  for (const table of model.tables) {
    if (!table.comment.trim()) {
      issues.push(`Describe table ${table.name}`);
    }
    if (!table.columns.some((column) => column.primaryKey)) {
      issues.push(`Missing primary key: ${table.name}`);
    }
    if (table.checks.length) {
      issues.push(`CHECK expressions are not supported: ${table.name}`);
    }

    const columnNames = table.columns.map((column) => column.name);
    issues.push(
      ...duplicates(columnNames).map(
        (name) => `Duplicate column ${table.name}.${name}`,
      ),
    );

    for (const column of table.columns) {
      if (column.primaryKey && column.nullable) {
        issues.push(
          `Primary key must not be nullable: ${table.name}.${column.name}`,
        );
      }
      if (column.type !== 'VARCHAR' && column.length !== null) {
        issues.push(
          `Length only applies to VARCHAR: ${table.name}.${column.name}`,
        );
      }
      if (
        column.defaultValue !== null &&
        !isSafeDefault(column.defaultValue.trim())
      ) {
        issues.push(`Unsafe default: ${table.name}.${column.name}`);
      }
      const reference = column.references;
      if (reference) {
        foreignKeys += 1;
        const parent = tables[reference.table];
        const target = parent?.columns.find(
          (candidate) => candidate.name === reference.column,
        );
        if (
          !target ||
          !(target.primaryKey || target.unique) ||
          target.type !== column.type
        ) {
          issues.push(`Invalid foreign key: ${table.name}.${column.name}`);
        }
        const parentIndex = order.get(reference.table);
        const tableIndex = order.get(table.name);
        if (
          parentIndex !== undefined &&
          tableIndex !== undefined &&
          parentIndex >= tableIndex
        ) {
          issues.push(
            `List the referenced table before ${table.name}: ${reference.table}`,
          );
        }
      }
    }
    for (const index of table.indexes) {
      if (difference(index.columns, columnNames).length) {
        issues.push(`Unknown index column: ${index.name}`);
      }
    }
  }
  if (foreignKeys === 0) {
    issues.push('The schema needs at least one relationship (foreign key).');
  }
  return issues;
}

export function verifySeedData(seed: SeedData, model: DataModel): string[] {
  const issues: string[] = [];
  const tableNames = model.tables.map((table) => table.name);
  const tables = keyBy(model.tables, (table) => table.name);
  const seeds = keyBy(seed.tables, (entry) => entry.table);
  const order = new Map(tableNames.map((name, index) => [name, index]));
  const seedNames = seed.tables.map((entry) => entry.table);

  issues.push(
    ...duplicates(seedNames).map((name) => `Duplicate seed table: ${name}`),
  );

  let previous = -1;
  for (const entry of seed.tables) {
    const table = tables[entry.table];
    if (!table) {
      issues.push(`Unknown seed table: ${entry.table}`);
      continue;
    }
    const position = order.get(entry.table) ?? -1;
    if (position < previous) {
      issues.push(`Seed tables must follow schema order: ${entry.table}`);
    }
    previous = position;

    const columnNames = table.columns.map((column) => column.name);
    const keys = entry.rows.map((row) =>
      JSON.stringify(
        table.columns
          .filter((column) => column.primaryKey)
          .map((column) => row[column.name]),
      ),
    );
    if (duplicates(keys).length) {
      issues.push(`Duplicate primary key: ${entry.table}`);
    }

    for (const row of entry.rows) {
      for (const name of difference(Object.keys(row), columnNames)) {
        issues.push(`Unknown column: ${entry.table}.${name}`);
      }
      for (const column of table.columns) {
        const value = row[column.name];
        if (
          (value === undefined || value === null) &&
          !column.nullable &&
          column.defaultValue === null
        ) {
          issues.push(`Missing required value: ${entry.table}.${column.name}`);
        }
        if (
          value !== undefined &&
          value !== null &&
          !validValue(column.type, value)
        ) {
          issues.push(`Wrong value type: ${entry.table}.${column.name}`);
        }
        const reference = column.references;
        if (reference && value !== undefined && value !== null) {
          const parent = seeds[reference.table];
          const found = parent?.rows.some(
            (candidate) =>
              String(candidate[reference.column]) === String(value),
          );
          if (!found) {
            issues.push(
              `Unresolved foreign key: ${entry.table}.${column.name}`,
            );
          }
        }
      }
    }
  }
  for (const name of difference(tableNames, seedNames)) {
    issues.push(`Missing seed table: ${name}`);
  }
  return issues;
}

interface ParsedStatement {
  type: string;
  tables: string[];
  parameters: string[];
  hasWhere: boolean;
}

function tableName(entry: string): string {
  const separator = entry.lastIndexOf('::');
  return separator < 0 ? entry : entry.slice(separator + 2);
}

function parameterNames(node: unknown): string[] {
  const names: string[] = [];
  const queue = [node];
  for (let depth = 0; depth < 20 && queue.length > 0; depth += 1) {
    for (const item of queue.splice(0)) {
      if (!isRecord(item)) {
        continue;
      }
      if (item.type === 'param' && typeof item.value === 'string') {
        names.push(item.value);
      }
      queue.push(...Object.values(item));
    }
  }
  return names;
}

function parseStatement(statement: string): ParsedStatement | undefined {
  const trimmed = statement.trim();
  const sql = trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
  if (
    sql.length === 0 ||
    sql.includes(';') ||
    sql.includes('--') ||
    sql.includes('/*')
  ) {
    return undefined;
  }
  let ast;
  try {
    ast = parser.astify(sql, DIALECT);
  } catch {
    return undefined;
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    return undefined;
  }
  const node = statements[0];
  if (
    !isRecord(node) ||
    typeof node.type !== 'string' ||
    !STATEMENT_TYPES.includes(node.type)
  ) {
    return undefined;
  }
  return {
    type: node.type,
    tables: parser.tableList(sql, DIALECT).map(tableName),
    parameters: parameterNames(node),
    hasWhere: node.where !== null && node.where !== undefined,
  };
}

export function verifyCodePlan(plan: CodePlan, model: DataModel): string[] {
  const issues: string[] = [];
  const tableNames = model.tables.map((table) => table.name);
  const tables = keyBy(model.tables, (table) => table.name);
  const operationNames = plan.operations.map((operation) => operation.name);

  issues.push(
    ...duplicates(operationNames).map((name) => `Duplicate operation: ${name}`),
  );

  for (const operation of plan.operations) {
    if (duplicates(operation.tables).length) {
      issues.push(`Repeated table: ${operation.name}`);
    }
    if (difference(operation.tables, tableNames).length) {
      issues.push(`Unknown table: ${operation.name}`);
    }

    const parsed = parseStatement(operation.statement);
    if (!parsed) {
      issues.push(`Invalid SQL statement: ${operation.name}`);
      continue;
    }

    for (const name of difference(operation.tables, parsed.tables)) {
      issues.push(`SQL omits table ${name}: ${operation.name}`);
    }
    for (const name of difference(parsed.tables, operation.tables)) {
      issues.push(`SQL uses unlisted table ${name}: ${operation.name}`);
    }
    if (
      (parsed.type === 'update' || parsed.type === 'delete') &&
      !parsed.hasWhere
    ) {
      issues.push(`Write operation needs a WHERE clause: ${operation.name}`);
    }

    const allowed = operation.tables.flatMap(
      (name) => tables[name]?.columns.map((column) => column.name) ?? [],
    );
    if (duplicates(operation.parameters).length) {
      issues.push(`Duplicate parameter: ${operation.name}`);
    }
    const invalid = uniq([
      ...difference(operation.parameters, allowed),
      ...difference(operation.parameters, parsed.parameters),
    ]);
    for (const parameter of invalid) {
      issues.push(`Invalid parameter ${parameter}: ${operation.name}`);
    }
    for (const parameter of difference(
      parsed.parameters,
      operation.parameters,
    )) {
      issues.push(`Undeclared parameter ${parameter}: ${operation.name}`);
    }
  }
  return issues;
}
