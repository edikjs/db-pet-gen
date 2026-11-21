import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ManifestSchema,
  RunRecorder,
  type RunManifest,
  writeManifest,
} from './runState';

it('redacts credentials from stage logs and writes the manifest atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'db-pet-log-'));
  try {
    const now = new Date().toISOString();
    const manifest: RunManifest = {
      version: 1,
      runId: 'example',
      topic: 'pets',
      status: 'running',
      stage: null,
      startedAt: now,
      updatedAt: now,
      pid: process.pid,
      resumptions: 0,
      error: null,
      stages: {},
      model: {
        provider: 'openrouter',
        name: 'test',
        baseUrl: 'https://openrouter.ai/api/v1',
        temperature: 0,
      },
    };
    await writeManifest(join(root, 'run.json'), manifest);
    const recorder = new RunRecorder(root, manifest, 'secret-token');
    await recorder.progress({ kind: 'stage_started', stage: 'design' });
    await recorder.progress({
      kind: 'stage_finished',
      stage: 'design',
      detail: 'secret-token refused sk-another-secret1234567890',
    });
    await recorder.finish('failed', 'secret-token failed');
    const log = await readFile(join(root, 'events.jsonl'), 'utf8');
    expect(log).not.toContain('secret-token');
    expect(log).not.toContain('sk-another-secret1234567890');
    expect(
      ManifestSchema.parse(
        JSON.parse(await readFile(join(root, 'run.json'), 'utf8')),
      ),
    ).toMatchObject({
      status: 'failed',
      stage: 'design',
      error: '[REDACTED] failed',
      stages: { design: { attempts: 1, status: 'completed' } },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
