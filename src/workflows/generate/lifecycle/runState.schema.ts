import { z } from 'zod';

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
