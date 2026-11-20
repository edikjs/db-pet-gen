import type {
  CodeFile,
  CodePlan,
  DataModel,
  ProjectPlan,
  SeedData,
} from '../../../project';

type SmokeReport = {
  status: 'passed' | 'failed' | 'skipped';
  reason?: string | null;
  rowCounts: Record<string, number>;
};

type ReadmeInput = {
  topic: string;
  plan: ProjectPlan;
  model: DataModel;
  seed: SeedData;
  codePlan: CodePlan;
  codeFiles: readonly CodeFile[];
  diagram: string;
  smoke: SmokeReport;
};

const IDENTIFIER = /^[a-z][a-z0-9_]*$/u;
const MERMAID_TYPES = new Set([
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'REAL',
  'NUMERIC',
  'TEXT',
  'VARCHAR',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
]);
const SECTIONS = [
  'Project overview',
  'Design',
  'ER diagram',
  'Data dictionary',
  'Sample data',
  'PostgreSQL setup',
  'Operations and queries',
  'Code map',
  'Smoke test',
  'Limitations',
] as const;

function safeNames(names: readonly string[], prefix: string): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    let result =
      IDENTIFIER.test(name) && name !== 'end' ? name : `${prefix}_${index + 1}`;
    let suffix = 1;
    while (used.has(result)) result = `${prefix}_${index + 1}_${suffix++}`;
    used.add(result);
    return result;
  });
}

/** Render an ER diagram using only Mermaid-safe tokens, never untrusted comments. */
export function renderErDiagram(model: DataModel): string {
  const lines = ['erDiagram'];
  const tableNames = safeNames(
    model.tables.map((table) => table.name),
    'entity',
  );
  const firstTableName = new Map<string, string>();
  model.tables.forEach((table, index) => {
    if (!firstTableName.has(table.name))
      firstTableName.set(table.name, tableNames[index]);
  });

  model.tables.forEach((table, index) => {
    const columns = safeNames(
      table.columns.map((column) => column.name),
      'column',
    );
    lines.push(`    ${tableNames[index]} {`);
    table.columns.forEach((column, columnIndex) => {
      const keys = [
        column.primaryKey ? 'PK' : '',
        column.references ? 'FK' : '',
        column.unique ? 'UK' : '',
      ].filter(Boolean);
      const type = MERMAID_TYPES.has(column.type) ? column.type : 'UNKNOWN';
      lines.push(
        `        ${type} ${columns[columnIndex]}${keys.length ? ` ${keys.join(', ')}` : ''}`,
      );
    });
    lines.push('    }');
  });

  model.tables.forEach((table, index) => {
    const columns = safeNames(
      table.columns.map((column) => column.name),
      'column',
    );
    const solePrimaryKey =
      table.columns.filter((column) => column.primaryKey).length === 1;
    table.columns.forEach((column, columnIndex) => {
      if (!column.references) return;
      const parent = firstTableName.get(column.references.table);
      if (!parent) return;
      const parentCardinality = column.nullable ? 'o|' : '||';
      const childCardinality =
        column.unique || (column.primaryKey && solePrimaryKey) ? 'o|' : 'o{';
      lines.push(
        `    ${parent} ${parentCardinality}--${childCardinality} ${tableNames[index]} : ${columns[columnIndex]}`,
      );
    });
  });

  return `${lines.join('\n')}\n`;
}

function plain(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Escapes Markdown formatting and raw HTML in model-provided prose. */
function inline(text: string): string {
  return plain(text)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/([\\`*_{}[\]()#!|])/gu, '\\$1');
}

/** A pipe remains a cell delimiter even when it appears inside inline code. */
function cell(text: string): string {
  if (/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/u.test(text)) return text;
  if (/^[A-Z]+(?:\(\d+\))?$/u.test(text)) return text;
  return inline(text);
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/gu))
    longest = Math.max(longest, match[0].length);
  return longest;
}

function code(text: string): string {
  const value = plain(text);
  const ticks = '`'.repeat(longestBacktickRun(value) + 1);
  const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${ticks}${padding}${value}${padding}${ticks}`;
}

/** Use a longer fence than any backtick run in untrusted SQL or diagram text. */
function fenced(language: string, content: string): string {
  const ticks = '`'.repeat(Math.max(2, longestBacktickRun(content)) + 1);
  return `${ticks}${language}\n${content.replace(/\s+$/u, '')}\n${ticks}`;
}

function codePath(file: CodeFile): string | null {
  const path = file.path.startsWith('assets/')
    ? file.path
    : `assets/${file.path}`;
  return /^assets\/code\/[a-zA-Z0-9_-]+\.(?:ts|sql)$/u.test(path) ? path : null;
}

function fileLink(path: string): string {
  return `[${path}](${path})`;
}

function relationships(model: DataModel): string[] {
  const results: string[] = [];
  for (const table of model.tables) {
    const solePrimaryKey =
      table.columns.filter((column) => column.primaryKey).length === 1;
    for (const column of table.columns) {
      if (!column.references) continue;
      const cardinality =
        column.unique || (column.primaryKey && solePrimaryKey)
          ? 'at most one child per parent'
          : 'many children per parent';
      results.push(
        `- ${code(`${table.name}.${column.name}`)} → ${code(`${column.references.table}.${column.references.column}`)} (${column.nullable ? 'optional' : 'required'} parent; ${cardinality}).`,
      );
    }
  }
  return results;
}

/** Produce an English README for the checked project data and generated assets. */
export function renderReadme(input: ReadmeInput): string {
  const { plan, model, seed, codePlan, codeFiles, smoke } = input;
  // The diagram argument normally comes from renderErDiagram. Rebuild if it does
  // not match the model: arbitrary Mermaid directives must not enter the README.
  const generatedDiagram = renderErDiagram(model);
  const diagram =
    input.diagram === generatedDiagram ? input.diagram : generatedDiagram;
  const links = codeFiles.map((file) => ({ file, path: codePath(file) }));
  const queries = links.find(({ path }) => path?.endsWith('/queries.sql'));
  const relationshipLines = relationships(model);
  const seedCounts = new Map(
    seed.tables.map((entry) => [entry.table, entry.rows.length]),
  );
  const lines: string[] = [
    `# ${inline(plan.title)}`,
    '',
    '## Project overview',
    '',
    inline(plan.summary),
    '',
    `Topic: ${inline(input.topic)}.`,
    '',
    '### Assumptions',
    '',
    ...plan.assumptions.map((assumption) => `- ${inline(assumption)}`),
    '',
    '### Features',
    '',
    ...plan.features.map((feature) => `- ${inline(feature)}`),
    '',
    '## Design',
    '',
    `The model has ${model.tables.length} tables. Primary keys identify rows; declared foreign keys connect child rows to their referenced parent rows. Column types, nullability, uniqueness, defaults, and explicit indexes are listed in the data dictionary below.`,
    '',
    '## ER diagram',
    '',
    `Mermaid source: ${fileLink('assets/diagrams/er.mmd')}.`,
    '',
    fenced('mermaid', diagram),
    '',
    '### Relationships (text alternative)',
    '',
    ...(relationshipLines.length
      ? relationshipLines
      : ['No foreign-key relationships are declared.']),
    '',
    '## Data dictionary',
    '',
    'The indexes below are explicitly declared; primary-key and unique constraints also receive supporting indexes in PostgreSQL.',
  ];

  for (const table of model.tables) {
    lines.push(
      '',
      `### ${inline(table.name)}`,
      '',
      inline(table.comment || 'No table description was supplied.'),
      '',
      '| Column | Type | PK | FK (references) | Nullable | Unique | Default | Description |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const column of table.columns) {
      const type =
        column.type === 'VARCHAR' && column.length !== null
          ? `VARCHAR(${column.length})`
          : column.type;
      lines.push(
        `| ${cell(column.name)} | ${cell(type)} | ${column.primaryKey ? 'Yes' : 'No'} | ${column.references ? cell(`${column.references.table}.${column.references.column}`) : '—'} | ${column.nullable ? 'Yes' : 'No'} | ${column.unique ? 'Yes' : 'No'} | ${column.defaultValue === null ? '—' : cell(column.defaultValue)} | ${cell(column.comment)} |`,
      );
    }
    lines.push('', 'Explicit indexes:', '');
    if (table.indexes.length === 0) {
      lines.push('- None declared.');
    } else {
      for (const index of table.indexes) {
        const detail = index.comment ? ` — ${inline(index.comment)}` : '';
        lines.push(
          `- ${code(index.name)} on ${index.columns.map(code).join(', ')} (${index.unique ? 'unique' : 'non-unique'})${detail}.`,
        );
      }
    }
    if (table.checks.length) {
      lines.push(
        '',
        'Check constraints:',
        '',
        ...table.checks.map((check) => `- ${inline(check)}`),
      );
    }
  }

  lines.push(
    '',
    '## Sample data',
    '',
    `The seed script is ${fileLink('assets/seed/seed.sql')}. These counts describe the generated seed rows, not a live database:`,
    '',
    '| Table | Seed rows |',
    '| --- | ---: |',
    ...model.tables.map(
      (table) => `| ${cell(table.name)} | ${seedCounts.get(table.name) ?? 0} |`,
    ),
    '',
    'Example records (at most two per table; the seed script contains the full data):',
    '',
    ...model.tables.flatMap((table) => [
      `### ${inline(table.name)} records`,
      '',
      fenced(
        'json',
        JSON.stringify(
          seed.tables
            .find((entry) => entry.table === table.name)
            ?.rows.slice(0, 2) ?? [],
          null,
          2,
        ),
      ),
      '',
    ]),
    '## PostgreSQL setup',
    '',
    `From the directory containing this README, use the PostgreSQL schema ${fileLink('assets/ddl/schema.sql')} and then the seed script ${fileLink('assets/seed/seed.sql')}. A running PostgreSQL server and the \`createdb\` and \`psql\` clients are required:`,
    '',
    fenced(
      'sh',
      'createdb db_pet_gen_demo\npsql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/ddl/schema.sql\npsql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/seed/seed.sql',
    ),
    '',
    'Create the database only once. Execute the schema before the seed data, on a fresh database; rerunning the scripts may fail on existing tables or keys.',
    '',
    '## Operations and queries',
    '',
    queries?.path
      ? `The operation statements are collected in ${fileLink(queries.path)}. Named parameters such as \`:id\` require application binding or adaptation before running in \`psql\`; the query file is not a standalone seed script.`
      : 'No separate query script was provided.',
  );

  for (const operation of codePlan.operations) {
    lines.push(
      '',
      `### ${inline(operation.title)}`,
      '',
      `Operation: ${code(operation.name)}. Tables: ${operation.tables.map(code).join(', ')}. Parameters: ${operation.parameters.length ? operation.parameters.map(code).join(', ') : 'none'}.`,
      '',
      fenced('sql', operation.statement),
    );
  }

  lines.push(
    '',
    '## Code map',
    '',
    'These are generated TypeScript example modules and the query listing, not a complete PostgreSQL application:',
    '',
    '| File | Purpose |',
    '| --- | --- |',
    ...links.map(
      ({ file, path }) =>
        `| ${path ? fileLink(path) : `${cell(file.path)} (invalid path; not linked)`} | ${cell(file.summary)} |`,
    ),
    '',
    '## Smoke test',
    '',
    'When run, the smoke check uses an in-memory SQLite database via Node.js `node:sqlite`; it is not a PostgreSQL integration test.',
    '',
    `Status: **${smoke.status}**.${smoke.reason ? ` Reason: ${inline(smoke.reason)}.` : ''}`,
    '',
    ...(Object.keys(smoke.rowCounts).length
      ? [
          '| Table | Verified rows |',
          '| --- | ---: |',
          ...Object.entries(smoke.rowCounts)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
              ([table, count]) => `| ${cell(table)} | ${cell(String(count))} |`,
            ),
        ]
      : ['No verified row counts were reported.']),
    '',
    '## Limitations',
    '',
    '- The PostgreSQL DDL and seed files are setup scripts. The TypeScript code skeleton uses the SQLite example driver (`node:sqlite`), **not** a runnable PostgreSQL application. Using it with PostgreSQL requires a PostgreSQL driver and query/binding adaptations.',
    '- The SQLite smoke result does not establish that the scripts ran successfully on PostgreSQL.',
    '- Generated code is an illustrative starting point, not a packaged application or a production security, migration, or deployment solution.',
    '',
  );

  return lines.join('\n');
}

/** Report missing README sections and broken or non-relative Markdown file links. */
export function lintReadme(
  markdown: string,
  availablePaths: readonly string[],
): string[] {
  const issues: string[] = [];
  const known = new Set(
    availablePaths.map((path) => path.replace(/^\.\//u, '')),
  );
  const textLines: string[] = [];
  let fence: { character: string; length: number } | null = null;
  let mermaid = false;
  let diagramHeaderPending = false;

  for (const line of markdown.split(/\r?\n/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})([a-zA-Z0-9_-]*)\s*$/u.exec(line);
    if (marker) {
      const characters = marker[1];
      if (!fence) {
        diagramHeaderPending = marker[2] === 'mermaid';
        fence = { character: characters[0], length: characters.length };
        continue;
      }
      if (
        !marker[2] &&
        characters[0] === fence.character &&
        characters.length >= fence.length
      ) {
        fence = null;
        diagramHeaderPending = false;
        continue;
      }
    }
    if (fence && diagramHeaderPending && line.trim()) {
      if (line.trim() === 'erDiagram') mermaid = true;
      diagramHeaderPending = false;
    }
    if (!fence) textLines.push(line);
  }

  if (fence) issues.push('Unclosed Markdown code fence.');
  if (!/^# .+$/mu.test(markdown)) issues.push('Missing project title.');
  for (const section of SECTIONS) {
    if (!textLines.includes(`## ${section}`))
      issues.push(`Missing section: ${section}.`);
  }
  if (!textLines.includes('### Relationships (text alternative)'))
    issues.push('Missing text relationship fallback.');
  if (!mermaid) issues.push('Missing Mermaid ER diagram.');

  for (const line of textLines) {
    const links = line.matchAll(/(?<!\\)!?\[[^\]\n]*\]\(([^)\s]+)\)/gu);
    for (const match of links) {
      const target = match[1];
      if (target.startsWith('#')) continue;
      if (
        /^(?:\/|\\|[a-z][a-z0-9+.-]*:)/iu.test(target) ||
        target.split('/').includes('..')
      ) {
        issues.push(`Non-relative README link: ${target}`);
        continue;
      }
      const path = target.split('#')[0].replace(/^\.\//u, '');
      try {
        if (!known.has(decodeURIComponent(path)))
          issues.push(`Missing linked file: ${path}`);
      } catch {
        issues.push(`Invalid README link: ${target}`);
      }
    }
  }

  return issues;
}
