import type { Heading, Nodes, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Design, Examples } from '../../src/workflows/generate/domain';
import {
  README_FALLBACK,
  README_SECTIONS,
} from '../../src/workflows/generate/rules';

export interface SubstanceCheck {
  readonly name: string;
  readonly passed: boolean;
}

const parser = unified().use(remarkParse);

/**
 * Structure is already a hard gate; these checks score what the gate ignores:
 * whether each section carries content and names the checked design, rows,
 * operations and relationships.
 */
export function readmeSubstance(
  design: Design,
  examples: Examples,
): SubstanceCheck[] {
  const root = parser.parse(examples.readme);
  const sections = new Map(
    README_SECTIONS.map((name) => [name, sectionNodes(root, name)]),
  );
  const wholeText = textOf(root.children).toLocaleLowerCase();
  const sampleText = textOf(
    sections.get('Sample data') ?? [],
  ).toLocaleLowerCase();
  const operationsText = textOf(
    sections.get('Operations and queries') ?? [],
  ).toLocaleLowerCase();
  const fallbackText = textOf(
    sectionNodes(root, README_FALLBACK),
  ).toLocaleLowerCase();

  const seedValues = examples.tables
    .flatMap((table) => table.rows.flatMap((row) => Object.values(row)))
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length >= 3,
    );
  const parameters = examples.operations.flatMap(
    (operation) => operation.parameters,
  );
  const relationships = design.tables.flatMap((table) =>
    table.columns.flatMap((column) =>
      column.references ? [[table.name, column.references.table]] : [],
    ),
  );

  return [
    {
      name: 'sections_have_content',
      passed: README_SECTIONS.every((name) =>
        hasContent(sections.get(name) ?? []),
      ),
    },
    {
      name: 'design_names_tables',
      passed: mentionsAll(
        wholeText,
        design.tables.map((table) => table.name),
      ),
    },
    {
      name: 'sample_names_tables_and_rows',
      passed:
        mentionsAll(
          sampleText,
          examples.tables.map((table) => table.table),
        ) &&
        seedValues.some((value) => sampleText.includes(value.toLowerCase())),
    },
    {
      name: 'operations_documented',
      passed: mentionsAll(
        operationsText,
        examples.operations.map((operation) => operation.name),
      ),
    },
    {
      name: 'parameters_documented',
      passed: mentionsAll(operationsText, parameters),
    },
    {
      name: 'relationships_described',
      passed: relationships.every(([child, parent]) =>
        [child, parent].every((name) =>
          fallbackText.includes(name.toLowerCase()),
        ),
      ),
    },
  ];
}

function sectionNodes(root: Root, title: string): Nodes[] {
  const children = root.children;
  const index = children.findIndex(
    (node) => node.type === 'heading' && toString(node) === title,
  );
  if (index < 0) return [];
  const depth = (children[index] as Heading).depth;
  const rest = children.slice(index + 1);
  const boundary = rest.findIndex(
    (node) => node.type === 'heading' && node.depth <= depth,
  );
  return boundary < 0 ? rest : rest.slice(0, boundary);
}

function hasContent(nodes: readonly Nodes[]): boolean {
  return nodes.some(
    (node) => node.type !== 'heading' && toString(node).trim().length > 0,
  );
}

function textOf(nodes: readonly Nodes[]): string {
  return nodes.map((node) => toString(node)).join('\n');
}

function mentionsAll(text: string, names: readonly string[]): boolean {
  return names.every((name) => text.includes(name.toLowerCase()));
}
