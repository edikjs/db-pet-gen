import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ManifestSchema,
  type RunManifest,
} from '../../workflows/generate/domain';
import { appendEvent, readManifest, writeManifest } from './journal';

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

it('writes the manifest atomically and appends ordered events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'db-pet-log-'));
  try {
    await writeManifest(root, manifest);
    await appendEvent(root, {
      at: now,
      runId: 'example',
      kind: 'stage_started',
      stage: 'design',
      detail: 'redacted detail',
    });
    await appendEvent(root, {
      at: now,
      runId: 'example',
      kind: 'stage_finished',
      stage: 'design',
      detail: '',
    });

    expect(ManifestSchema.parse(await readManifest(root))).toEqual(manifest);
    const log = await readFile(join(root, 'events.jsonl'), 'utf8');
    expect(
      log
        .trim()
        .split('\n')
        .map((row) => JSON.parse(row).kind),
    ).toEqual(['stage_started', 'stage_finished']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
