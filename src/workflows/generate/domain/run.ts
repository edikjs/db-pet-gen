import { z } from 'zod';
import type { ModelIdentity, PipelineEvent } from '../../ports';

export const ManifestSchema = z.object({
  version: z.number().int(),
  runId: z.string(),
  threadId: z.string().optional(),
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

export interface NewRun {
  version: number;
  runId: string;
  topic: string;
  model: ModelIdentity;
  now: string;
}

export function createManifest({
  version,
  runId,
  topic,
  model,
  now,
}: NewRun): RunManifest {
  return {
    version,
    runId,
    topic,
    status: 'running',
    stage: null,
    startedAt: now,
    updatedAt: now,
    pid: process.pid,
    resumptions: 0,
    error: null,
    stages: {},
    model,
  };
}

/** The pure part of the old recorder: stage events mutate run state in place. */
export function applyStageEvent(
  manifest: RunManifest,
  event: PipelineEvent,
  now: string,
): void {
  const entry = manifest.stages[event.stage];
  if (event.kind === 'stage_started') {
    manifest.stage = event.stage;
    manifest.stages[event.stage] = {
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
  entry.error = failed ? (event.detail ?? '') : null;
  entry.finishedAt = now;
}
