import type {
  DataColumn,
  DataIndex,
  DataModel,
  DataTable,
  SeedData,
  SeedValue,
} from '../../../project';

/**
 * The SQL of the data layer, rendered in code.
 *
 * The model proposes the schema and the sample data as data; this module
 * turns them into the two scripts of the pet project. The rendering is
 * deterministic: the same schema always gives the same script, and the script
 * is valid SQL whatever the model answered — the names are identifiers, the
 * types come from the vocabulary of the schema and the values become SQL
 * literals the renderer escapes.
 */

/**
 * Renders the DDL of the schema: the tables with their columns, their primary
 * keys, their foreign keys, their check constraints and their indexes.
 */
export function renderDdl(model: DataModel, topic: string): string {
  const blocks: string[] = [`-- Schema for ${topic}.`];

  for (const table of model.tables) {
    blocks.push('', `-- Table: ${table.name}${commentSuffix(table.comment)}`);
    blocks.push(renderTable(table));

    for (const index of table.indexes) {
      blocks.push('');
      if (index.comment.length > 0) {
        blocks.push(`-- ${oneLine(index.comment)}`);
      }
      blocks.push(renderIndex(table, index));
    }
  }

  return `${blocks.join('\n')}\n`;
}

/**
 * Renders the sample data: one INSERT per table, the rows of the table in the
 * order they were proposed.
 */
export function renderSeedScript(
  seed: SeedData,
  model: DataModel,
  topic: string,
): string {
  const blocks: string[] = [`-- Seed data for ${topic}.`];

  for (const seeded of seed.tables) {
    const table = model.tables.find(
      (candidate) => candidate.name === seeded.table,
    );
    if (!table) {
      continue;
    }
    blocks.push('', renderInsert(table, seeded.rows));
  }

  return `${blocks.join('\n')}\n`;
}

/**
 * Renders the schema as an outline — the tables, their columns and their
 * keys. The prompt of the seed data shows it, so the model fills the tables
 * the schema really holds.
 */
export function renderSchemaOutline(model: DataModel): string {
  const lines: string[] = [];

  for (const table of model.tables) {
    lines.push(`- ${table.name}${commentSuffix(table.comment)}`);
    for (const column of table.columns) {
      lines.push(`  - ${renderColumnOutline(column)}`);
    }
  }

  return lines.join('\n');
}

/** The CREATE TABLE statement of one table. */
function renderTable(table: DataTable): string {
  const definitions = table.columns.map((column) => renderColumnBlock(column));
  const key = table.columns.filter((column) => column.primaryKey);

  if (key.length > 0) {
    definitions.push(
      `  CONSTRAINT pk_${table.name} PRIMARY KEY (${key
        .map((column) => column.name)
        .join(', ')})`,
    );
  }

  table.checks.forEach((check, index) => {
    definitions.push(
      `  CONSTRAINT chk_${table.name}_${index + 1} CHECK (${oneLine(check)})`,
    );
  });

  return `CREATE TABLE ${table.name} (\n${definitions.join(',\n')}\n);`;
}

/**
 * The definition of one column, with its comment above it.
 *
 * The comment sits on its own line: a comment at the end of the definition
 * would swallow the comma that separates the columns.
 */
function renderColumnBlock(column: DataColumn): string {
  const lines: string[] = [];

  if (column.comment.length > 0) {
    lines.push(`  -- ${oneLine(column.comment)}`);
  }
  lines.push(`  ${renderColumn(column)}`);

  return lines.join('\n');
}

/** The definition of one column inside a CREATE TABLE statement. */
function renderColumn(column: DataColumn): string {
  let definition = `${column.name} ${column.type}`;

  if (column.type === 'VARCHAR' && column.length !== null) {
    definition += `(${column.length})`;
  }
  if (!column.nullable || column.primaryKey) {
    definition += ' NOT NULL';
  }
  if (column.unique && !column.primaryKey) {
    definition += ' UNIQUE';
  }
  if (column.defaultValue !== null) {
    definition += ` DEFAULT ${column.defaultValue}`;
  }
  if (column.references !== null) {
    definition += ` REFERENCES ${column.references.table} (${column.references.column})`;
  }

  return definition;
}

/** The CREATE INDEX statement of one index. */
function renderIndex(table: DataTable, index: DataIndex): string {
  const unique = index.unique ? 'UNIQUE ' : '';
  return `CREATE ${unique}INDEX ${index.name} ON ${table.name} (${index.columns.join(', ')});`;
}

/** The INSERT statement of the rows of one table. */
function renderInsert(
  table: DataTable,
  rows: Record<string, SeedValue>[],
): string {
  const columns = Object.keys(rows[0]);
  const header = `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES`;
  const values = rows.map(
    (row) =>
      `  (${columns.map((column) => sqlLiteral(row[column])).join(', ')})`,
  );

  return `${header}\n${values.join(',\n')};`;
}

/** One column of the schema, as the outline of the prompt shows it. */
function renderColumnOutline(column: DataColumn): string {
  const parts = [column.name, column.type];

  if (column.type === 'VARCHAR' && column.length !== null) {
    parts[1] = `${column.type}(${column.length})`;
  }
  if (column.primaryKey) {
    parts.push('PRIMARY KEY');
  }
  if (!column.nullable) {
    parts.push('NOT NULL');
  }
  if (column.unique) {
    parts.push('UNIQUE');
  }
  if (column.references !== null) {
    parts.push(
      `REFERENCES ${column.references.table}(${column.references.column})`,
    );
  }
  if (column.comment.length > 0) {
    parts.push(`— ${oneLine(column.comment)}`);
  }

  return parts.join(' ');
}

/**
 * The SQL literal of a value of the seed data.
 *
 * The strings are quoted and their quotes doubled, so a value never breaks
 * out of its literal; the numbers, the booleans and the null are written as
 * they are.
 */
export function sqlLiteral(value: SeedValue): string {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** The comment of a table or of a column, as a comment line. */
function commentSuffix(comment: string): string {
  return comment.length > 0 ? ` — ${oneLine(comment)}` : '';
}

/** A comment on one line: the line breaks of the model would break the SQL. */
function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}
