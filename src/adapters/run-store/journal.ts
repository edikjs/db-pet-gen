import { randomBytes } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunEvent } from '../../workflows/ports';
import type { RunManifest } from '../../workflows/generate/domain';

const MANIFEST = 'run.json';
const EVENTS = 'events.jsonl';

function file(root: string, name: string): string {
  return join(root, name);
}

/** Atomic replace so a killed process never leaves a truncated manifest. */
export async function writeManifest(
  root: string,
  value: RunManifest,
): Promise<void> {
  const path = file(root, MANIFEST);
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

export async function readManifest(root: string): Promise<RunManifest> {
  return JSON.parse(
    await readFile(file(root, MANIFEST), 'utf8'),
  ) as RunManifest;
}

/** Human-readable manifest plus ordered, timestamped JSONL events. */
export async function appendEvent(
  root: string,
  event: RunEvent,
): Promise<void> {
  await appendFile(file(root, EVENTS), `${JSON.stringify(event)}\n`, 'utf8');
}
