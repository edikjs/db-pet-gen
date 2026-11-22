import type {
  ArtifactSinkPort,
  CheckpointPort,
  ModelPort,
  RunStorePort,
  TracePort,
} from '../ports';
import type { PipelineResult } from './pipeline';

/** Everything the use case needs, supplied by the composition root. */
export interface WorkflowPorts {
  model: ModelPort;
  runStore: RunStorePort;
  checkpoints: CheckpointPort;
  artifacts: ArtifactSinkPort;
  trace: TracePort;
}

export interface RunResult {
  runId: string;
  workspace: string;
  readmePath: string;
  state: PipelineResult;
}
