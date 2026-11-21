import type { DataColumn, DataIndex, DataTable } from '../../../../shared';
import {
  blocks,
  bulletList,
  bullets,
  codeList,
  fenced,
  heading,
  inlineCode,
  link,
  paragraph,
  proseParagraph,
  proseText,
  text,
} from '../nodes';
import type {
  BlockNode,
  InlineNode,
  ReadmeContext,
  ReadmeSection,
} from '../types';

const NO_DESCRIPTION = 'No table description was supplied.';
/** `No` / `Yes` indexed by the numeric value of a flag. */
const FLAG_LABELS = ['No', 'Yes'] as const;
const DDL_PATH = 'assets/ddl/schema.sql';
const SEED_PATH = 'assets/seed/seed.sql';
const DIAGRAM_PATH = 'assets/diagrams/er.mmd';
const SETUP_COMMANDS = [
  'createdb db_pet_gen_demo',
  `psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f ${DDL_PATH}`,
  `psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f ${SEED_PATH}`,
].join('\n');

const LIMITATIONS: readonly (readonly InlineNode[])[] = [
  [
    proseText(
      'The PostgreSQL DDL and seed files are setup scripts, not a packaged application. Apply them to a fresh database; rerunning them may fail on existing tables or keys.',
    ),
  ],
  [
    proseText(
      'Operation statements are parsed and checked against the declared tables, but they are not executed against a live database; ',
    ),
    inlineCode('psql'),
    proseText(' requires parameter binding or adaptation before they can run.'),
  ],
];

/** The title, summary, assumptions and features of the project. */
export const overviewSection: ReadmeSection = ({ input }) => [
  heading(1, input.plan.title),
  heading(2, 'Project overview'),
  proseParagraph(input.plan.summary),
  paragraph([proseText('Topic: '), proseText(input.topic), proseText('.')]),
  heading(3, 'Assumptions'),
  bullets(input.plan.assumptions),
  heading(3, 'Features'),
  bullets(input.plan.features),
];

/** The design summary. */
export const designSection: ReadmeSection = ({ input }) => [
  heading(2, 'Design'),
  proseParagraph(
    `The model has ${input.model.tables.length} tables. Primary keys identify rows; declared foreign keys connect child rows to their referenced parent rows. Column types, nullability, uniqueness, defaults, and explicit indexes are listed in the data dictionary below.`,
  ),
];

/** One relationship, rendered as inline code and prose. */
function relationshipLine(
  relationship: ReadmeContext['relationships'][number],
): InlineNode[] {
  const parent = relationship.optional ? 'optional' : 'required';
  const children = relationship.atMostOne
    ? 'at most one child per parent'
    : 'many children per parent';

  return [
    inlineCode(`${relationship.child}.${relationship.column}`),
    text(' → '),
    inlineCode(`${relationship.parent}.${relationship.parentColumn}`),
    proseText(` (${parent} parent; ${children})`),
    text('.'),
  ];
}

/** The Mermaid diagram and its text alternative. */
export const erSection: ReadmeSection = (context) =>
  blocks([
    heading(2, 'ER diagram'),
    paragraph([
      proseText('Mermaid source: '),
      link(DIAGRAM_PATH, DIAGRAM_PATH),
      text('.'),
    ]),
    fenced('mermaid', context.diagram),
    heading(3, 'Relationships (text alternative)'),
    context.relationships.length > 0
      ? bulletList(context.relationships.map(relationshipLine))
      : proseParagraph('No foreign-key relationships are declared.'),
  ]);

/** The documented type of a column. */
function columnType(column: DataColumn): string {
  return column.type === 'VARCHAR' && column.length !== null
    ? `${column.type}(${column.length})`
    : column.type;
}

/** The reference target of a column, when it has one. */
function referenceText(column: DataColumn): string {
  return column.references === null
    ? '—'
    : `${column.references.table}.${column.references.column}`;
}

/** One row of the data dictionary. */
function columnLine(column: DataColumn): InlineNode[] {
  return [
    inlineCode(column.name),
    proseText(
      ` — ${columnType(column)}; PK: ${FLAG_LABELS[Number(column.primaryKey)]}; FK: ${referenceText(
        column,
      )}; nullable: ${FLAG_LABELS[Number(column.nullable)]}; unique: ${
        FLAG_LABELS[Number(column.unique)]
      }; default: ${column.defaultValue ?? '—'}; description: ${column.comment || '—'}`,
    ),
  ];
}

/** One declared index of a table. */
function indexLine(index: DataIndex): InlineNode[] {
  const kind = index.unique ? 'unique' : 'non-unique';
  const detail = index.comment.length > 0 ? ` — ${index.comment}` : '';
  const parts: InlineNode[] = [inlineCode(index.name), text(' on ')];
  return parts.concat(
    codeList(index.columns),
    proseText(` (${kind})${detail}.`),
  );
}

/** One table of the data dictionary. */
function tableBlocks(table: DataTable): BlockNode[] {
  const checkBlocks: BlockNode[] =
    table.checks.length > 0
      ? [
          heading(4, 'Check constraints'),
          bulletList(table.checks.map((check) => [proseText(check)])),
        ]
      : [];

  return blocks([
    heading(3, table.name),
    proseParagraph(table.comment || NO_DESCRIPTION),
    heading(4, 'Columns'),
    bulletList(table.columns.map(columnLine)),
    heading(4, 'Explicit indexes'),
    table.indexes.length > 0
      ? bulletList(table.indexes.map(indexLine))
      : bulletList([[proseText('None declared.')]]),
  ]).concat(checkBlocks);
}

/** The tables, their columns and their constraints. */
export const dataDictionarySection: ReadmeSection = ({ input }) => {
  const sections: BlockNode[] = [
    heading(2, 'Data dictionary'),
    proseParagraph(
      'The indexes below are explicitly declared; primary-key and unique constraints also receive supporting indexes in PostgreSQL.',
    ),
  ];
  return sections.concat(input.model.tables.flatMap(tableBlocks));
};

/** The generated sample rows and their counts. */
export const sampleDataSection: ReadmeSection = (context) => {
  const { model, seed } = context.input;
  const exampleBlocks = model.tables.flatMap((table) => {
    const rows =
      seed.tables
        .find((entry) => entry.table === table.name)
        ?.rows.slice(0, 2) ?? [];
    return [
      heading(4, `${table.name} records`),
      fenced('json', JSON.stringify(rows, null, 2)),
    ];
  });

  const sections: BlockNode[] = [
    heading(2, 'Sample data'),
    paragraph([
      proseText('The seed script is '),
      link(SEED_PATH, SEED_PATH),
      proseText(
        '. These counts describe the generated seed rows, not a live database:',
      ),
    ]),
    bulletList(
      model.tables.map((table) => [
        inlineCode(table.name),
        proseText(`: ${context.seedCounts.get(table.name) ?? 0} seed rows`),
      ]),
    ),
    proseParagraph(
      'Example records (at most two per table; the seed script contains the full data):',
    ),
  ];
  return sections.concat(exampleBlocks);
};

/** How to load the PostgreSQL scripts. */
export const setupSection: ReadmeSection = () => [
  heading(2, 'PostgreSQL setup'),
  paragraph([
    proseText(
      'From the directory containing this README, use the PostgreSQL schema ',
    ),
    link(DDL_PATH, DDL_PATH),
    proseText(' and then the seed script '),
    link(SEED_PATH, SEED_PATH),
    proseText(
      '. A running PostgreSQL server and the `createdb` and `psql` clients are required:',
    ),
  ]),
  fenced('sh', SETUP_COMMANDS),
  proseParagraph(
    'Create the database only once. Execute the schema before the seed data, on a fresh database; rerunning the scripts may fail on existing tables or keys.',
  ),
];

/** The description of one operation. */
function operationLine(
  operation: ReadmeContext['input']['operations']['operations'][number],
): InlineNode[] {
  const parts: InlineNode[] = [
    proseText('Operation: '),
    inlineCode(operation.name),
    proseText('. Tables: '),
  ];
  return parts
    .concat(codeList(operation.tables), proseText('. Parameters: '))
    .concat(
      operation.parameters.length > 0
        ? codeList(operation.parameters)
        : [text('none')],
      text('.'),
    );
}

/** The operations and their SQL statements. */
export const operationsSection: ReadmeSection = (context) => {
  const intro: BlockNode[] = [
    heading(2, 'Operations and queries'),
    paragraph([
      proseText('Named parameters such as '),
      inlineCode(':id'),
      proseText(
        ' require application binding or adaptation before running in ',
      ),
      inlineCode('psql'),
      proseText('; these statements are not a standalone seed script.'),
    ]),
  ];

  const operations: BlockNode[] = context.input.operations.operations.flatMap(
    (operation) => [
      heading(3, operation.title),
      paragraph(operationLine(operation)),
      fenced('sql', operation.statement),
    ],
  );
  return intro.concat(operations);
};

/** What the generated project does not provide. */
export const limitationsSection: ReadmeSection = () => [
  heading(2, 'Limitations'),
  bulletList(LIMITATIONS),
];
