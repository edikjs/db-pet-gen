import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import anyAscii from 'any-ascii';
import type { RunWorkspace } from './types';

function nameRun(topic: string): string {
  const slug =
    anyAscii(topic)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '')
      .slice(0, 48) || 'database';
  return `${new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15)}-${slug}-${randomBytes(3).toString('hex')}`;
}

export async function createRunWorkspace(
  runsDir: string,
  topic: string,
): Promise<RunWorkspace> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error('A nonempty topic is required.');
  if (trimmed.length > 160 || /[\r\n\0]/u.test(trimmed)) {
    throw new Error('The topic must be one line of at most 160 characters.');
  }
  const runId = nameRun(trimmed);
  const parent = resolve(runsDir);
  const root = resolve(parent, runId);
  await mkdir(parent, { recursive: true });
  await mkdir(root, { recursive: false });
  return { runId, root };
}

export function openRunWorkspace(runsDir: string, runId: string): RunWorkspace {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(runId)) throw new Error('Invalid run id.');
  return { runId, root: resolve(runsDir, runId) };
}
