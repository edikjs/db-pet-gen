import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArtifactFile } from '../../workflows/ports';

/** The checked files are the only writes to a generated project. */
export async function writeArtifactFiles(
  root: string,
  files: readonly ArtifactFile[],
): Promise<void> {
  for (const { path, contents } of files) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, 'utf8');
  }
}
