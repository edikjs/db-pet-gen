import type { RunResult } from '../generate/types';
import type { PipelineEvent } from './types';

export interface GenerateCommand {
  topic: string;
  onProgress?: (event: PipelineEvent) => void;
  onRunStarted?: (runId: string, workspace: string) => void;
}

export interface ResumeCommand {
  runId: string;
  onProgress?: (event: PipelineEvent) => void;
}

/** The only application service the driving adapter may call. */
export interface GenerateWorkflow {
  generate(command: GenerateCommand): Promise<RunResult>;
  resume(command: ResumeCommand): Promise<RunResult>;
}
