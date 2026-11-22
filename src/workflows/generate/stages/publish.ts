import type { ArtifactFile, ArtifactSinkPort } from '../../ports';
import {
  OPERATIONS_PATH,
  QA_REPORT_PATH,
  README_PATH,
  passReport,
  type Design,
  type Examples,
} from '../domain';

/** Maps each generated file to the checked data it contains. */
function artifactFiles(design: Design, examples: Examples): ArtifactFile[] {
  return [
    { path: 'assets/ddl/schema.sql', contents: design.ddl },
    { path: 'assets/seed/seed.sql', contents: examples.seedSql },
    { path: OPERATIONS_PATH, contents: examples.operationsSql },
    { path: 'assets/diagrams/er.mmd', contents: design.mermaid },
    { path: README_PATH, contents: examples.readme },
    { path: QA_REPORT_PATH, contents: passReport() },
  ];
}

/** Also used to repair an interrupted publication from its terminal checkpoint. */
export async function publish(
  sink: ArtifactSinkPort,
  workspace: string,
  design: Design,
  examples: Examples,
): Promise<void> {
  await sink.write(workspace, artifactFiles(design, examples));
}
