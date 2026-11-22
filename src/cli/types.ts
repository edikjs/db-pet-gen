import type { GenerateWorkflow } from '../workflows';

export interface CliDependencies {
  workflow?: GenerateWorkflow;
  write?: (line: string) => void;
  error?: (line: string) => void;
}
