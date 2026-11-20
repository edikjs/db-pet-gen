import {
  blocks,
  bulletList,
  heading,
  inlineCode,
  link,
  paragraph,
  proseParagraph,
  proseText,
  strong,
  text,
} from '../nodes';
import type { CodeLink, InlineNode, ReadmeSection } from '../types';

const LIMITATIONS: readonly (readonly InlineNode[])[] = [
  [
    text(
      'The PostgreSQL DDL and seed files are setup scripts. The TypeScript code skeleton uses the SQLite example driver (',
    ),
    inlineCode('node:sqlite'),
    text('), '),
    strong('not'),
    text(
      ' a runnable PostgreSQL application. Using it with PostgreSQL requires a PostgreSQL driver and query/binding adaptations.',
    ),
  ],
  [
    text(
      'The SQLite smoke result does not establish that the scripts ran successfully on PostgreSQL.',
    ),
  ],
  [
    text(
      'Generated code is an illustrative starting point, not a packaged application or a production security, migration, or deployment solution.',
    ),
  ],
];

/** One generated code file and its purpose. */
function codeLine(entry: CodeLink): InlineNode[] {
  return entry.path === undefined
    ? [
        inlineCode(entry.file.path),
        proseText(` (invalid path; not linked) — ${entry.file.summary}`),
      ]
    : [link(entry.path, entry.path), proseText(` — ${entry.file.summary}`)];
}

/** The map of generated assets. */
export const codeMapSection: ReadmeSection = (context) => [
  heading(2, 'Code map'),
  proseParagraph(
    'These are generated TypeScript example modules and the query listing, not a complete PostgreSQL application:',
  ),
  bulletList(context.links.map(codeLine)),
];

/** The result of the in-memory smoke check. */
export const smokeSection: ReadmeSection = ({ input }) => {
  const { smoke } = input;
  const counts = Object.entries(smoke.rowCounts).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const status: InlineNode[] = [text('Status: '), strong(smoke.status)].concat(
    smoke.reason ? [proseText(` Reason: ${smoke.reason}.`)] : [],
  );

  return blocks([
    heading(2, 'Smoke test'),
    proseParagraph(
      'When run, the smoke check uses an in-memory SQLite database via Node.js `node:sqlite`; it is not a PostgreSQL integration test.',
    ),
    paragraph(status),
    counts.length > 0
      ? bulletList(
          counts.map(([table, count]) => [
            inlineCode(table),
            proseText(`: ${count} verified rows`),
          ]),
        )
      : proseParagraph('No verified row counts were reported.'),
  ]);
};

/** What the generated project does not provide. */
export const limitationsSection: ReadmeSection = () => [
  heading(2, 'Limitations'),
  bulletList(LIMITATIONS),
];
