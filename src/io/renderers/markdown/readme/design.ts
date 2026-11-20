import type { DataColumn, DataIndex, DataTable } from '../../../../project';
import { yesNo } from '../../shared/text';
import {
  blocks,
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

const NO_DESCRIPTION = 'No table description was supplied.';

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
      link('assets/diagrams/er.mmd', 'assets/diagrams/er.mmd'),
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
      ` — ${columnType(column)}; PK: ${yesNo(column.primaryKey)}; FK: ${referenceText(
        column,
      )}; nullable: ${yesNo(column.nullable)}; unique: ${yesNo(
        column.unique,
      )}; default: ${column.defaultValue ?? '—'}; description: ${column.comment || '—'}`,
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
