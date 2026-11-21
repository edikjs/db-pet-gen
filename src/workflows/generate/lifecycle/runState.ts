import { randomBytes } from 'node:crypto';
import { appendFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redact as redactText } from '../../../shared';
import type { PipelineEvent } from '../types';
import type { RunManifest } from './runState.schema';

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

  private updateStage(event: PipelineEvent, now: string): void {
    const entry = this.manifest.stages[event.stage];
    if (event.kind === 'stage_started') {
      this.manifest.stage = event.stage;
      this.manifest.stages[event.stage] = {
        status: 'running',
        attempts: (entry?.attempts ?? 0) + 1,
        startedAt: now,
        finishedAt: null,
        error: null,
      };
      return;
    }
    if (!entry) return;
    const failed = event.kind === 'stage_failed';
    entry.status = failed ? 'failed' : 'completed';
    entry.error = failed ? this.redact(event.detail ?? '') : null;
    entry.finishedAt = now;
  }

  async progress(event: PipelineEvent): Promise<void> {
    const now = new Date().toISOString();
    this.updateStage(event, now);
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
