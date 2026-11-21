import type { Design, Examples } from '../../shared';

const FILES = {
  ddl: 'assets/ddl/schema.sql',
  seed: 'assets/seed/seed.sql',
  diagram: 'assets/diagrams/er.mmd',
} as const;

/** The asset links the README may use and the files the pipeline publishes. */
export const ASSET_PATHS = Object.values(FILES);

/** Maps each generated file to the checked data it contains. */
export function artifactFiles(
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
