import type { ObservabilityProvider } from '../../adapters/observability';
import type { AppConfig } from '../../config';
import type { GenerationModel } from '../../llm';
import type { PipelineResult } from './pipelineState.schema';

export interface PipelineEvent {
  kind: 'stage_started' | 'stage_finished' | 'stage_failed';
  stage: string;
  detail?: string;
}

export interface PipelineOptions {
  model: GenerationModel;
  workspace: string;
  onEvent?: (event: PipelineEvent) => void | Promise<void>;
}

export interface RunResult {
  runId: string;
  workspace: string;
  readmePath: string;
  state: PipelineResult;
}

export interface RunOptions {
  config: AppConfig;
  model?: GenerationModel;
  createObservabilityProvider?: () => ObservabilityProvider;
  onProgress?: (event: PipelineEvent) => void;
}

export interface GenerateOptions extends RunOptions {
  topic: string;
  onRunStarted?: (runId: string, workspace: string) => void;
}

export interface ResumeOptions extends RunOptions {
  runId: string;
}
