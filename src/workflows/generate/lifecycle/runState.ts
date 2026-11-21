import { randomBytes } from 'node:crypto';
import { appendFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { redact as redactText } from '../../../shared';
import type { PipelineEvent } from '../types';

export const ManifestSchema = z.object({
  version: z.number().int(),
  runId: z.string(),
  topic: z.string(),
  status: z.enum(['running', 'failed', 'completed']),
  stage: z.string().nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  pid: z.number().int(),
  resumptions: z.number().int(),
  error: z.string().nullable(),
  stages: z.record(
    z.string(),
    z.object({
      status: z.enum(['running', 'completed', 'failed']),
      attempts: z.number().int(),
      startedAt: z.string(),
      finishedAt: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
  model: z.object({
    provider: z.string(),
    name: z.string(),
    baseUrl: z.string(),
    temperature: z.number(),
  }),
});
export type RunManifest = z.infer<typeof ManifestSchema>;

export async function writeManifest(
  path: string,
  value: RunManifest,
): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

/** Human-readable manifest plus ordered, timestamped JSONL events. */
export class RunRecorder {
  constructor(
    readonly workspace: string,
    public manifest: RunManifest,
    private readonly apiKey?: string,
  ) {}

  redact(detail: string): string {
    return redactText(detail, this.apiKey);
  }

  async event(kind: string, detail?: string): Promise<void> {
    const record = {
      at: new Date().toISOString(),
      runId: this.manifest.runId,
      kind,
      stage: this.manifest.stage,
      detail: this.redact(detail ?? ''),
    };
    await appendFile(
      join(this.workspace, 'events.jsonl'),
      `${JSON.stringify(record)}\n`,
      'utf8',
    );
  }

  async progress(event: PipelineEvent): Promise<void> {
    const now = new Date().toISOString();
    if (event.kind === 'stage_started') {
      this.manifest.stage = event.stage;
      this.manifest.stages[event.stage] = {
        status: 'running',
        attempts: (this.manifest.stages[event.stage]?.attempts ?? 0) + 1,
        startedAt: now,
        finishedAt: null,
        error: null,
      };
    } else if (
      event.kind === 'stage_finished' ||
      event.kind === 'stage_failed'
    ) {
      const entry = this.manifest.stages[event.stage];
      if (entry) {
        entry.status = event.kind === 'stage_finished' ? 'completed' : 'failed';
        entry.finishedAt = now;
        entry.error =
          event.kind === 'stage_failed'
            ? this.redact(event.detail ?? '')
            : null;
      }
    }
    this.manifest.updatedAt = now;
    await this.event(event.kind, event.detail);
    await writeManifest(join(this.workspace, 'run.json'), this.manifest);
  }

  async finish(
    status: 'completed' | 'failed',
    error: string | null = null,
  ): Promise<void> {
    this.manifest.status = status;
    this.manifest.error = error === null ? null : this.redact(error);
    this.manifest.updatedAt = new Date().toISOString();
    if (status === 'completed') this.manifest.stage = null;
    await this.event(
      status === 'completed' ? 'run_completed' : 'run_failed',
      this.manifest.error ?? undefined,
    );
    if (status === 'failed') {
      await writeFile(
        join(this.workspace, 'qa-report.json'),
        `${JSON.stringify(
          {
            verdict: 'failed',
            stage: this.manifest.stage,
            issue: this.manifest.error,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }
    await writeManifest(join(this.workspace, 'run.json'), this.manifest);
  }
}
