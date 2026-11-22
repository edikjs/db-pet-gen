import type { RunManifest } from '../generate/domain/run';
import type {
  ArtifactFile,
  CheckpointHandle,
  ModelIdentity,
  RunEvent,
  RunWorkspace,
  StageEventKind,
  StructuredRequest,
} from './types';

/** The model call, including transport retries and credential handling. */
export interface ModelPort {
  json<T>(request: StructuredRequest<T>): Promise<T>;
  identity(): ModelIdentity;
  redact(text: string): string;
  containsSecret(text: string): boolean;
}

/** All on-disk run state except the generated artifacts. */
export interface RunStorePort {
  createWorkspace(topic: string): Promise<RunWorkspace>;
  openWorkspace(runId: string): RunWorkspace;
  readManifest(root: string): Promise<RunManifest>;
  writeManifest(root: string, manifest: RunManifest): Promise<void>;
  appendEvent(root: string, event: RunEvent): Promise<void>;
  withLock<T>(root: string, action: () => Promise<T>): Promise<T>;
}

/** LangGraph's checkpoint store is the one framework type in a port. */
export interface CheckpointPort {
  open(root: string): CheckpointHandle;
}

/** Writes the checked artifacts into a run workspace. */
export interface ArtifactSinkPort {
  write(root: string, files: readonly ArtifactFile[]): Promise<void>;
}

/** Stage timing handed to the tracing backend. */
export interface TracePort {
  stageEvent(stage: string, kind: StageEventKind): void;
  shutdown(): Promise<void>;
}
