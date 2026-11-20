const SECTIONS: readonly string[] = [
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
];

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

/** True for an absolute path, a Windows path or a URI scheme. */
function externalTarget(target: string): boolean {
  if (target.startsWith('/') || target.startsWith('\\')) return true;
  const colon = target.indexOf(':');
  if (colon < 0) return false;
  const slash = target.indexOf('/');
  return slash < 0 || colon < slash;
}

/** Markdown link targets of one line, ignoring escaped brackets. */
function linkTargets(line: string): string[] {
  const targets: string[] = [];
  let index = 0;

  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2;
      continue;
    }
    if (line[index] === '[') {
      const delimiter = line.indexOf('](', index + 1);
      const end = delimiter < 0 ? -1 : line.indexOf(')', delimiter + 2);
      if (end > delimiter) {
        targets.push(line.slice(delimiter + 2, end));
        index = end + 1;
        continue;
      }
    }
    index += 1;
  }
  return targets;
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
  const textLines: string[] = [];
  let fence: Fence | undefined;
  let diagramHeaderPending = false;
  let mermaid = false;

  for (const line of markdown.split('\n')) {
    const marker = fenceMarker(line);
    if (fence === undefined && marker !== undefined) {
      fence = marker;
      diagramHeaderPending =
        line.trimStart().slice(marker.length).trim() === 'mermaid';
      continue;
    }
    if (
      fence !== undefined &&
      marker !== undefined &&
      marker.character === fence.character &&
      marker.length >= fence.length
    ) {
      fence = undefined;
      diagramHeaderPending = false;
      continue;
    }
    if (fence !== undefined && diagramHeaderPending && line.trim().length > 0) {
      mermaid = line.trim() === 'erDiagram';
      diagramHeaderPending = false;
    }
    if (fence === undefined) textLines.push(line);
  }

  if (fence !== undefined) issues.push('Unclosed Markdown code fence.');
  if (!textLines.some((line) => line.startsWith('# ')))
    issues.push('Missing project title.');
  SECTIONS.forEach((section) => {
    if (!textLines.includes(`## ${section}`))
      issues.push(`Missing section: ${section}.`);
  });
  if (!textLines.includes('### Relationships (text alternative)'))
    issues.push('Missing text relationship fallback.');
  if (!mermaid) issues.push('Missing Mermaid ER diagram.');

  textLines.forEach((line) => {
    linkTargets(line).forEach((target) => {
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
  });

  return issues;
}
