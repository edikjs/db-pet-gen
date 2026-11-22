import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import anyAscii from 'any-ascii';
import { kebabCase } from 'es-toolkit';
import type { RunWorkspace } from '../../workflows/ports';

function nameRun(topic: string): string {
  const slug = kebabCase(anyAscii(topic)).slice(0, 48) || 'database';
  const stamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '-')
    .slice(0, 15);
  return `${stamp}-${slug}-${randomBytes(3).toString('hex')}`;
}

export async function createRunWorkspace(
  runsDir: string,
  topic: string,
): Promise<RunWorkspace> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error('A nonempty topic is required.');
  if (
    trimmed.length > 160 ||
    ['\r', '\n', '\0'].some((control) => trimmed.includes(control))
  ) {
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
  const allowed = 'abcdefghijklmnopqrstuvwxyz0123456789-';
  if (
    !runId ||
    runId.startsWith('-') ||
    !Array.from(runId).every((char) => allowed.includes(char))
  )
    throw new Error('Invalid run id.');
  return { runId, root: resolve(runsDir, runId) };
}
