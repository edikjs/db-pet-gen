import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRunCheckpointer } from './checkpointer';

it('opens and closes a durable per-run SQLite journal', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'db-pet-checkpoints-'));
  try {
    const journal = openRunCheckpointer(workspace);
    journal.close();
    expect(await readdir(workspace)).toContain('checkpoints.db');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
