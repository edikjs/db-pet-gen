import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunWorkspace, openRunWorkspace } from './workspace';

describe('run workspace', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'db-pet-workspace-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a unique, path-safe run for the topic', async () => {
    const run = await createRunWorkspace(root, 'Cat rescue');
    expect(run.runId).toMatch(/cat-rescue-[a-f0-9]{6}$/u);
    expect(openRunWorkspace(root, run.runId)).toEqual(run);
    expect(await readdir(root)).toEqual([run.runId]);
  });

  it('creates the output directory when it does not exist yet', async () => {
    const runsDir = join(root, 'artifacts', 'runs');
    const run = await createRunWorkspace(runsDir, 'Cat rescue');
    expect(run.root).toBe(join(runsDir, run.runId));
    expect(await readdir(runsDir)).toEqual([run.runId]);
  });

  it('refuses directory traversal and multiline topics', async () => {
    expect(() => openRunWorkspace(root, '../other')).toThrow(/Invalid run id/u);
    await expect(
      createRunWorkspace(root, 'Cats\nDROP TABLE pets;'),
    ).rejects.toThrow(/one line/u);
    expect(await readdir(root)).toEqual([]);
  });
});
