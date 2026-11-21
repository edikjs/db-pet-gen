import { difference, isEqual } from 'es-toolkit';
import type { Heading, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { parse, postprocess, preprocess } from 'micromark';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { EXIT, visit } from 'unist-util-visit';

export const README_SECTIONS: readonly string[] = [
  'Project overview',
  'Design',
  'ER diagram',
  'Data dictionary',
  'Sample data',
  'PostgreSQL setup',
  'Operations and queries',
  'Limitations',
];
export const README_FALLBACK = 'Relationships (text alternative)';

const parser = unified().use(remarkParse);

function normalizeDiagram(source: string): string {
  return source.replaceAll('\r\n', '\n').trim();
}

/** remark accepts an implicit close at EOF; micromark keeps the actual fences. */
function hasUnclosedFence(markdown: string): boolean {
  const chunks = preprocess()(markdown, 'utf8', true);
  const tokens = postprocess(parse().document().write(chunks))
    .filter(([event]) => event === 'exit')
    .map(([, token]) => token.type);
  const blocks = tokens.filter((type) => type === 'codeFenced');
  const fences = tokens.filter((type) => type === 'codeFencedFence');
  return fences.length !== 2 * blocks.length;
}

/** True for an absolute path, a Windows path or a URI scheme. */
function externalTarget(target: string): boolean {
  if (target.startsWith('/') || target.startsWith('\\')) return true;
  const colon = target.indexOf(':');
  if (colon < 0) return false;
  const slash = target.indexOf('/');
  return slash < 0 || colon < slash;
}

/** Only fragment links and links to generated assets are allowed. */
function checkTarget(
  target: string,
  known: ReadonlySet<string>,
  issues: string[],
): void {
  if (target.startsWith('#')) return;
  if (externalTarget(target) || target.split('/').includes('..')) {
    issues.push(`Non-relative README link: ${target}`);
    return;
  }
  const path = target.split('#')[0];
  const cleanPath = path.startsWith('./') ? path.slice(2) : path;
  try {
    if (!known.has(decodeURIComponent(cleanPath)))
      issues.push(`Missing linked file: ${cleanPath}`);
  } catch {
    issues.push(`Invalid README link: ${target}`);
  }
}

function headingIssues(tree: Root): string[] {
  const headings: Heading[] = [];
  visit(tree, 'heading', (node) => {
    headings.push(node);
  });
  const titlesAt = (depth: Heading['depth']) =>
    headings
      .filter((heading) => heading.depth === depth)
      .map((heading) => toString(heading));
  const issues = difference([...README_SECTIONS], titlesAt(2)).map(
    (name) => `Missing section: ${name}.`,
  );
  if (!titlesAt(1).length) issues.push('Missing project title.');
  if (!titlesAt(3).includes(README_FALLBACK))
    issues.push('Missing text relationship fallback.');
  return issues;
}

/** Checks model-written Markdown structure, safety and asset links. */
export function validateReadme(
  markdown: string,
  availablePaths: readonly string[],
  diagram: string,
): string[] {
  const tree = parser.parse(markdown);
  const issues = headingIssues(tree);
  const known = new Set(
    availablePaths.map((path) =>
      path.startsWith('./') ? path.slice(2) : path,
    ),
  );
  const diagrams: string[] = [];
  visit(tree, 'code', (node) => {
    if (node.lang === 'mermaid') diagrams.push(normalizeDiagram(node.value));
  });
  visit(tree, 'html', () => {
    issues.push('Raw HTML is not allowed.');
    return EXIT;
  });

  if (hasUnclosedFence(markdown)) issues.push('Unclosed Markdown code fence.');
  if (!isEqual(diagrams, [normalizeDiagram(diagram)]))
    issues.push('Embed exactly one copy of the checked Mermaid ER diagram.');

  visit(tree, ['link', 'image', 'definition'] as const, (node) =>
    checkTarget(node.url, known, issues),
  );

  return issues;
}
