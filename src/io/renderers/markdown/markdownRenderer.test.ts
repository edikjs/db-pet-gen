import {
  CodePlanSchema,
  DataModelSchema,
  ProjectPlanSchema,
  SeedDataSchema,
  type CodeFile,
  type DataModel,
} from '../../../shared';
import { lintReadme, renderErDiagram, renderReadme } from './markdownRenderer';

const model = DataModelSchema.parse({
  tables: [
    {
      name: 'authors',
      comment: 'People who write books.',
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          primaryKey: true,
          nullable: false,
          comment: 'Author ID.',
        },
        {
          name: 'name',
          type: 'VARCHAR',
          length: 80,
          nullable: false,
          comment: 'Display name.',
        },
      ],
      indexes: [
        {
          name: 'idx_author_name',
          columns: ['name'],
          comment: 'Find by name.',
        },
      ],
    },
    {
      name: 'books',
      comment: 'Published books.',
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          primaryKey: true,
          nullable: false,
          comment: 'Book ID.',
        },
        {
          name: 'author_id',
          type: 'INTEGER',
          nullable: false,
          references: { table: 'authors', column: 'id' },
          comment: 'The author.',
        },
        {
          name: 'title',
          type: 'TEXT',
          nullable: false,
          comment: 'Book title.',
        },
      ],
      indexes: [{ name: 'idx_books_author', columns: ['author_id'] }],
    },
  ],
});

const plan = ProjectPlanSchema.parse({
  title: 'Library catalogue',
  summary: 'An example catalogue of books and their authors.',
  assumptions: ['Each book has exactly one author.'],
  features: ['Store author details.', 'Look up books by their author.'],
});

const seed = SeedDataSchema.parse({
  tables: [
    { table: 'authors', rows: [{ id: 1, name: 'Mira' }] },
    {
      table: 'books',
      rows: [
        { id: 1, author_id: 1, title: 'First book' },
        { id: 2, author_id: 1, title: 'Second book' },
      ],
    },
  ],
});

const codePlan = CodePlanSchema.parse({
  operations: [
    {
      name: 'find_books',
      title: 'Find books by author',
      tables: ['books'],
      parameters: ['author_id'],
      statement: 'SELECT id, title FROM books WHERE author_id = :author_id',
    },
    {
      name: 'add_book',
      title: 'Add a book',
      tables: ['books'],
      parameters: ['id', 'author_id', 'title'],
      statement:
        'INSERT INTO books (id, author_id, title) VALUES (:id, :author_id, :title)',
    },
  ],
});

const files: CodeFile[] = [
  {
    id: 'database',
    path: 'code/database.ts',
    summary: 'Example SQLite driver.',
    content: '',
  },
  {
    id: 'schema',
    path: 'code/schema.ts',
    summary: 'Schema metadata.',
    content: '',
  },
  {
    id: 'repos',
    path: 'code/repositories.ts',
    summary: 'Repositories.',
    content: '',
  },
  {
    id: 'services',
    path: 'code/services.ts',
    summary: 'Services.',
    content: '',
  },
  {
    id: 'queries',
    path: 'code/queries.sql',
    summary: 'Named-parameter queries.',
    content: '',
  },
];

const availablePaths = [
  'assets/ddl/schema.sql',
  'assets/seed/seed.sql',
  'assets/diagrams/er.mmd',
  ...files.map((file) => `assets/${file.path}`),
];

function readme(
  overrides: Partial<Parameters<typeof renderReadme>[0]> = {},
): string {
  return renderReadme({
    topic: 'books and authors',
    plan,
    model,
    seed,
    codePlan,
    codeFiles: files,
    diagram: renderErDiagram(model),
    smoke: { status: 'passed', rowCounts: { authors: 1, books: 2 } },
    ...overrides,
  });
}

describe('renderErDiagram', () => {
  it('describes all entities, keys, and mandatory foreign-key relationships', () => {
    const diagram = renderErDiagram(model);
    expect(diagram).toContain('erDiagram\n');
    expect(diagram).toContain('authors {');
    expect(diagram).toContain('INTEGER id PK');
    expect(diagram).toContain('INTEGER author_id FK');
    expect(diagram).toContain('authors ||--o{ books : author_id');
  });

  it('replaces unsafe identifiers instead of emitting Mermaid directives or markup', () => {
    const invalid = {
      tables: model.tables.map((table, index) =>
        index === 0
          ? {
              ...table,
              name: 'authors\n%%{init: {"securityLevel": "loose"}}%%',
              columns: [
                {
                  ...table.columns[0],
                  name: 'id\nclick books "https://bad.example"',
                },
              ],
            }
          : table,
      ),
    } as DataModel;
    const diagram = renderErDiagram(invalid);
    expect(diagram).toContain('entity_1 {');
    expect(diagram).toContain('INTEGER column_1 PK');
    expect(diagram).not.toContain('%%{');
    expect(diagram).not.toContain('click books');
  });

  it('marks a nullable unique foreign key as optional and one-to-one', () => {
    const optional = DataModelSchema.parse({
      tables: [
        model.tables[0],
        {
          ...model.tables[1],
          columns: model.tables[1].columns.map((column) =>
            column.name === 'author_id'
              ? { ...column, nullable: true, unique: true }
              : column,
          ),
        },
      ],
    });
    expect(renderErDiagram(optional)).toContain(
      'authors o|--o| books : author_id',
    );
    expect(
      readme({ model: optional, diagram: renderErDiagram(optional) }),
    ).toContain(
      '`books.author_id` → `authors.id` (optional parent; at most one child per parent)',
    );
  });

  it('does not mistake one column of a composite primary key for a unique foreign key', () => {
    const composite = DataModelSchema.parse({
      tables: [
        model.tables[0],
        {
          ...model.tables[1],
          columns: model.tables[1].columns.map((column) =>
            column.name === 'author_id'
              ? { ...column, primaryKey: true }
              : column,
          ),
        },
      ],
    });
    expect(renderErDiagram(composite)).toContain(
      'authors ||--o{ books : author_id',
    );
  });
});

describe('renderReadme', () => {
  it('documents the design, data dictionary, setup, operations, smoke status and limitations', () => {
    const markdown = readme();
    for (const section of [
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
    ]) {
      expect(markdown).toContain(`## ${section}`);
    }
    expect(markdown).toContain('```mermaid\nerDiagram');
    expect(markdown).toContain(
      '`books.author_id` → `authors.id` (required parent; many children per parent)',
    );
    expect(markdown).toContain(
      '`author_id` — INTEGER; PK: No; FK: authors.id; nullable: No; unique: No; default: —; description: The author.',
    );
    expect(markdown).toContain(
      '`idx_books_author` on `author_id` (non-unique)',
    );
    expect(markdown).toContain('`books`: 2 seed rows');
    expect(markdown).toContain('### authors records');
    expect(markdown).toContain('"Mira"');
    expect(markdown).toContain(
      'psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/ddl/schema.sql',
    );
    expect(markdown).toContain('## Operations and queries');
    expect(markdown).toContain(
      'SELECT id, title FROM books WHERE author_id = :author_id',
    );
    expect(markdown).toContain('**passed**');
    expect(markdown).toContain('SQLite');
    expect(markdown).toContain('not** a runnable PostgreSQL application');
    expect(lintReadme(markdown, availablePaths)).toEqual([]);
  });

  it('links every generated asset relative to the README root', () => {
    const markdown = readme();
    for (const path of availablePaths) {
      expect(markdown).toContain(`](${path})`);
    }
    expect(markdown).toContain(
      '[assets/code/queries.sql](assets/code/queries.sql)',
    );
    expect(markdown).toContain(
      '[assets/code/database.ts](assets/code/database.ts)',
    );
  });

  it('escapes untrusted Markdown/HTML in prose and table cells and cannot close a SQL fence', () => {
    const unsafeModel = DataModelSchema.parse({
      tables: model.tables.map((table) =>
        table.name === 'books'
          ? {
              ...table,
              comment: 'Records | with\n<script>alert(1)</script>',
              columns: table.columns.map((column) =>
                column.name === 'title'
                  ? {
                      ...column,
                      comment: 'Title | [bad](https://bad.example)\nnext line',
                    }
                  : column,
              ),
            }
          : table,
      ),
    });
    const unsafePlan = ProjectPlanSchema.parse({
      ...plan,
      title: 'Library | <script>alert(1)</script>',
      assumptions: ['Assume [unsafe](https://bad.example) data is untrusted.'],
    });
    const unsafeCodePlan = CodePlanSchema.parse({
      ...codePlan,
      operations: [
        {
          ...codePlan.operations[0],
          statement: 'SELECT id FROM books\n````\n[bad](https://bad.example)',
        },
        codePlan.operations[1],
      ],
    });
    const markdown = readme({
      model: unsafeModel,
      plan: unsafePlan,
      codePlan: unsafeCodePlan,
      diagram: renderErDiagram(unsafeModel),
      codeFiles: [
        { ...files[0], summary: 'SQLite | driver\n<script>evil</script>' },
        ...files.slice(1),
      ],
      smoke: {
        status: 'skipped',
        reason: 'Needs | <script>server</script>',
        rowCounts: {},
      },
    });
    expect(markdown).toContain(
      '# Library | \\&lt;script\\&gt;alert(1)\\&lt;/script\\&gt;',
    );
    expect(markdown).toContain(
      'Records | with \\&lt;script\\&gt;alert(1)\\&lt;/script\\&gt;',
    );
    expect(markdown).toContain(
      'Title | \\[bad]\\(https://bad.example) next line',
    );
    expect(markdown).toContain(
      'SQLite | driver \\&lt;script\\&gt;evil\\&lt;/script\\&gt;',
    );
    expect(markdown).toContain(
      '`````sql\nSELECT id FROM books\n````\n[bad](https://bad.example)\n`````',
    );
    expect(markdown).not.toContain('<script>');
    expect(lintReadme(markdown, availablePaths)).toEqual([]);
  });
});

describe('lintReadme', () => {
  it('flags missing links, non-relative links, missing sections and unclosed fences', () => {
    const markdown = readme();
    expect(lintReadme(markdown, availablePaths.slice(1))).toContain(
      'Missing linked file: assets/ddl/schema.sql',
    );
    expect(
      lintReadme(
        markdown.replace('## Limitations', '## Other'),
        availablePaths,
      ),
    ).toContain('Missing section: Limitations.');
    expect(
      lintReadme(
        `${markdown}\n[external](https://bad.example)\n[up](../secret.sql)\n`,
        availablePaths,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Non-relative README link: https://bad.example',
        'Non-relative README link: ../secret.sql',
      ]),
    );
    expect(lintReadme(`${markdown}\n\`\`\`sql\n`, availablePaths)).toContain(
      'Unclosed Markdown code fence.',
    );
    expect(
      lintReadme(
        markdown.replace('```mermaid\nerDiagram', '```mermaid\nflowchart'),
        availablePaths,
      ),
    ).toContain('Missing Mermaid ER diagram.');
  });
});
