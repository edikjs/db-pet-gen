import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { z } from 'zod';

export type StageEventKind =
  'stage_started' | 'stage_finished' | 'stage_failed';

/** A progress event produced by a pipeline stage. */
export interface PipelineEvent {
  kind: StageEventKind;
  stage: string;
  detail?: string;
}

/** A provider-neutral prompt: adapters map this to their chat SDK. */
export interface PromptMessage {
  role: 'system' | 'user';
  content: string;
}

/** The core supplies the schema and the checks; the adapter owns retries. */
export interface StructuredRequest<T> {
  stage: string;
  messages: PromptMessage[];
  schema: z.ZodType<T> & Pick<z.ZodObject, 'shape'>;
  verify: (value: T) => string[] | Promise<string[]>;
  /** A valid review of faulty artifacts cannot be fixed by rewriting the verdict. */
  retryViolations?: boolean;
}

/** The model settings a resumed run must match. */
export interface ModelIdentity {
  provider: string;
  name: string;
  baseUrl: string;
  temperature: number;
}

export interface RunWorkspace {
  runId: string;
  root: string;
}

export interface RunEvent {
  at: string;
  runId: string;
  kind: string;
  stage: string | null;
  detail: string;
}

export interface ArtifactFile {
  path: string;
  contents: string;
}

export interface CheckpointHandle {
  saver: BaseCheckpointSaver;
  close(): void;
}
