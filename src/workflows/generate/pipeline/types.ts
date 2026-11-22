import type { ArtifactSinkPort, ModelPort } from '../../ports';
import type { StageOptions } from './stage';

export interface PipelineOptions extends StageOptions {
  model: ModelPort;
  workspace: string;
  artifacts: ArtifactSinkPort;
}
