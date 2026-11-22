import type { ArtifactSinkPort } from '../../workflows/ports';
import { writeArtifactFiles } from './writeArtifacts';

export function createArtifactSink(): ArtifactSinkPort {
  return { write: writeArtifactFiles };
}
