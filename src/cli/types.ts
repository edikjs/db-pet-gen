import type { AppConfig } from '../config';
import type {
  GenerateOptions,
  ResumeOptions,
  RunResult,
} from '../workflows/generate';

export interface CliDependencies {
  load?: () => AppConfig;
  generate?: (options: GenerateOptions) => Promise<RunResult>;
  resume?: (options: ResumeOptions) => Promise<RunResult>;
  write?: (line: string) => void;
  error?: (line: string) => void;
}
