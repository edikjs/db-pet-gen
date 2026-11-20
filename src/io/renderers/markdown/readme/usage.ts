import { joinLines } from '../../shared/source';
import {
  bulletList,
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

const SEED_PATH = 'assets/seed/seed.sql';
const SCHEMA_PATH = 'assets/ddl/schema.sql';
const SETUP_COMMANDS = joinLines([
  'createdb db_pet_gen_demo',
  'psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/ddl/schema.sql',
  'psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/seed/seed.sql',
]);

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
    link(SCHEMA_PATH, SCHEMA_PATH),
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
  operation: ReadmeContext['input']['codePlan']['operations'][number],
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
  const intro: BlockNode[] =
    context.queriesPath === undefined
      ? [proseParagraph('No separate query script was provided.')]
      : [
          paragraph([
            proseText('The operation statements are collected in '),
            link(context.queriesPath, context.queriesPath),
            proseText(
              '. Named parameters such as `:id` require application binding or adaptation before running in `psql`; the query file is not a standalone seed script.',
            ),
          ]),
        ];

  const operations: BlockNode[] = context.input.codePlan.operations.flatMap(
    (operation) => [
      heading(3, operation.title),
      paragraph(operationLine(operation)),
      fenced('sql', operation.statement),
    ],
  );
  return [heading(2, 'Operations and queries'), ...intro, ...operations];
};
