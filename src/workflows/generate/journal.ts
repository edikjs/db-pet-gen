import type { PipelineEvent } from '../ports';
import {
  applyStageEvent,
  failReport,
  QA_REPORT_PATH,
  type RunManifest,
} from './domain';
import type { WorkflowPorts } from './types';

/** Run-state transitions around the I/O ports. */
export function createJournal(
  ports: WorkflowPorts,
  workspace: string,
  manifest: RunManifest,
) {
  async function record(kind: string, detail = ''): Promise<void> {
    await ports.runStore.appendEvent(workspace, {
      at: new Date().toISOString(),
      runId: manifest.runId,
      kind,
      stage: manifest.stage,
      detail: ports.model.redact(detail),
    });
  }

  async function persist(): Promise<void> {
    await ports.runStore.writeManifest(workspace, manifest);
  }

  return {
    async event(kind: string, detail = ''): Promise<void> {
      await record(kind, detail);
    },
    async progress(event: PipelineEvent): Promise<void> {
      const now = new Date().toISOString();
      applyStageEvent(manifest, event, now);
      manifest.updatedAt = now;
      await record(event.kind, event.detail);
      await persist();
    },
    async finish(
      status: 'completed' | 'failed',
      error: string | null = null,
    ): Promise<void> {
      manifest.status = status;
      manifest.error = error === null ? null : ports.model.redact(error);
      manifest.updatedAt = new Date().toISOString();
      if (status === 'completed') manifest.stage = null;
      await record(
        status === 'completed' ? 'run_completed' : 'run_failed',
        manifest.error ?? undefined,
      );
      if (status === 'failed')
        await ports.artifacts.write(workspace, [
          {
            path: QA_REPORT_PATH,
            contents: failReport(manifest.stage, manifest.error ?? ''),
          },
        ]);
      await persist();
    },
  };
}
