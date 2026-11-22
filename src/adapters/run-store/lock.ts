import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A dedicated SQLite file keeps the OS lock independent of checkpoint writes. */
export async function withRunLock<T>(
  workspace: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = new DatabaseSync(join(workspace, 'run.lock'));
  try {
    lock.exec('BEGIN EXCLUSIVE');
    return await action();
  } finally {
    lock.close();
  }
}
