import type { CheckpointPort, RunStorePort } from '../../workflows/ports';
import { openRunCheckpointer } from './checkpointer';
import { appendEvent, readManifest, writeManifest } from './journal';
import { withRunLock } from './lock';
import { createRunWorkspace, openRunWorkspace } from './workspace';

export function createRunStore(runsDir: string): RunStorePort {
  return {
    createWorkspace: (topic) => createRunWorkspace(runsDir, topic),
    openWorkspace: (runId) => openRunWorkspace(runsDir, runId),
    readManifest,
    writeManifest,
    appendEvent,
    withLock: withRunLock,
  };
}

export function createCheckpointer(): CheckpointPort {
  return { open: openRunCheckpointer };
}

export { createRunWorkspace, openRunWorkspace } from './workspace';
