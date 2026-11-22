const FILES = {
  ddl: 'assets/ddl/schema.sql',
  seed: 'assets/seed/seed.sql',
  operations: 'assets/operations/operations.sql',
  diagram: 'assets/diagrams/er.mmd',
} as const;

/** The asset links the README may use and the files the pipeline publishes. */
export const ASSET_PATHS = Object.values(FILES);
export const OPERATIONS_PATH = FILES.operations;
export const README_PATH = 'README.md';
export const QA_REPORT_PATH = 'qa-report.json';

export function passReport(): string {
  return `${JSON.stringify({ verdict: 'pass' }, null, 2)}\n`;
}

export function failReport(stage: string | null, issue: string): string {
  return `${JSON.stringify({ verdict: 'failed', stage, issue }, null, 2)}\n`;
}
