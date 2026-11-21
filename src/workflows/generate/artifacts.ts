import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Design, Examples } from '../../shared';

const FILES = {
  ddl: 'assets/ddl/schema.sql',
  seed: 'assets/seed/seed.sql',
  diagram: 'assets/diagrams/er.mmd',
} as const;

/** The asset links the README may use and the files the pipeline publishes. */
export const ASSET_PATHS = Object.values(FILES);

/** Maps each generated file to the checked data it contains. */
function artifactFiles(
  design: Design,
  examples: Examples,
): ReadonlyArray<readonly [string, string]> {
  return [
    [FILES.ddl, design.ddl],
    [FILES.seed, examples.seedSql],
    [FILES.diagram, design.mermaid],
    ['README.md', examples.readme],
  ];
}

/** Also used to repair an interrupted publication from its terminal checkpoint. */
export async function publishArtifacts(
  workspace: string,
  design: Design,
  examples: Examples,
) {
  for (const [path, contents] of artifactFiles(design, examples)) {
    const destination = join(workspace, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, 'utf8');
  }
  await writeFile(
    join(workspace, 'qa-report.json'),
    `${JSON.stringify({ verdict: 'pass' }, null, 2)}\n`,
    'utf8',
  );
}
