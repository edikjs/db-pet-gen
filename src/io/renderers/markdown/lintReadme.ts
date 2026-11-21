import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const SECTIONS: readonly string[] = [
  'Project overview',
  'Design',
  'ER diagram',
  'Data dictionary',
  'Sample data',
  'PostgreSQL setup',
  'Operations and queries',
  'Limitations',
];

const FALLBACK = 'Relationships (text alternative)';
const parser = unified().use(remarkParse);

interface Fence {
  readonly character: string;
  readonly length: number;
}

/** The fence at the start of a line, when there is one. */
function fenceMarker(line: string): Fence | undefined {
  const trimmed = line.trimStart();
  const character = trimmed[0];
  if (character !== '`' && character !== '~') return undefined;

  let length = 0;
  while (trimmed[length] === character) length += 1;
  return length >= 3 ? { character, length } : undefined;
}

/** remark parses an unclosed fence as a normal code node; catch it textually. */
function hasUnclosedFence(markdown: string): boolean {
  let open: Fence | undefined;
  for (const line of markdown.split('\n')) {
    const marker = fenceMarker(line);
    if (open === undefined) {
      if (marker !== undefined) open = marker;
    } else if (
      marker !== undefined &&
      marker.character === open.character &&
      marker.length >= open.length
    ) {
      open = undefined;
    }
  }
  return open !== undefined;
}

/** True for an absolute path, a Windows path or a URI scheme. */
function externalTarget(target: string): boolean {
  if (target.startsWith('/') || target.startsWith('\\')) return true;
  const colon = target.indexOf(':');
  if (colon < 0) return false;
  const slash = target.indexOf('/');
  return slash < 0 || colon < slash;
}

/** Reports missing README sections, diagrams and broken relative links. */
export function lintReadme(
  markdown: string,
  availablePaths: readonly string[],
): string[] {
  const issues: string[] = [];
  const known = new Set(
    availablePaths.map((path) =>
      path.startsWith('./') ? path.slice(2) : path,
    ),
  );
  const tree = parser.parse(markdown) as Root;
  const sectionNames: string[] = [];
  let hasTitle = false;
  let hasFallback = false;
  let hasMermaid = false;

  visit(tree, (node) => {
    if (node.type === 'heading') {
      const value = toString(node);
      if (node.depth === 1) hasTitle = true;
      if (node.depth === 2) sectionNames.push(value);
      if (node.depth === 3 && value === FALLBACK) hasFallback = true;
    }
    if (node.type === 'code' && node.lang === 'mermaid') {
      const first = node.value.split('\n').find((line) => line.trim() !== '');
      if (first?.trim() === 'erDiagram') hasMermaid = true;
    }
  });

  if (hasUnclosedFence(markdown)) issues.push('Unclosed Markdown code fence.');
  if (!hasTitle) issues.push('Missing project title.');
  SECTIONS.forEach((section) => {
    if (!sectionNames.includes(section))
      issues.push(`Missing section: ${section}.`);
  });
  if (!hasFallback) issues.push('Missing text relationship fallback.');
  if (!hasMermaid) issues.push('Missing Mermaid ER diagram.');

  visit(tree, 'link', (node) => {
    const target = node.url;
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
  });

  return issues;
}
