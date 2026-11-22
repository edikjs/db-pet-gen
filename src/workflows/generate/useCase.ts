import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { errorMessage } from '../../shared';
import type { CheckpointHandle, ModelIdentity, PipelineEvent } from '../ports';
import {
  createManifest,
  DesignSchema,
  ExamplesSchema,
  ManifestSchema,
  README_PATH,
  type RunManifest,
} from './domain';
import { createJournal } from './journal';
import { buildPipeline, GRAPH_VERSION } from './pipeline';
import { publish } from './stages';
import type {
  GenerateCommand,
  GenerateWorkflow,
  ResumeCommand,
} from '../ports';
import type { RunResult, WorkflowPorts } from './types';

class UnreadableCheckpoint extends Error {}

function threadConfig(runId: string) {
  return { configurable: { thread_id: runId } };
}

function checkModel(manifest: RunManifest, current: ModelIdentity): void {
  if (
    manifest.model.provider !== current.provider ||
    manifest.model.name !== current.name ||
    manifest.model.baseUrl !== current.baseUrl ||
    manifest.model.temperature !== current.temperature
  ) {
    throw new Error(
      `Run ${manifest.runId} used ${manifest.model.provider}/${manifest.model.name}; restore the same LLM_* settings in .env to resume. Start a new run to switch models.`,
    );
  }
}

async function runStages(
  graph: ReturnType<ReturnType<typeof buildPipeline>['compile']>,
  ports: WorkflowPorts,
  workspace: string,
  manifest: RunManifest,
  resume: boolean,
) {
  const config = threadConfig(manifest.threadId ?? manifest.runId);
  const initial = { topic: manifest.topic, design: null, examples: null };
  if (!resume) return graph.invoke(initial, config);

  const snapshot = await graph.getState(config).catch(() => {
    throw new UnreadableCheckpoint('Cannot read checkpoints.db.');
  });
  if (!snapshot.createdAt) {
    manifest.threadId = randomUUID();
    await ports.runStore.writeManifest(workspace, manifest);
    await createJournal(ports, workspace, manifest).event(
      'checkpoint_missing',
      'Restarting from design.',
    );
    return graph.invoke(initial, threadConfig(manifest.threadId));
  }
  if (snapshot.next.length) return graph.invoke(null, config);

  const { topic, design, examples } = snapshot.values;
  if (topic !== manifest.topic)
    throw new Error('Terminal checkpoint topic does not match manifest.');
  const state = {
    topic: manifest.topic,
    design: DesignSchema.parse(design),
    examples: ExamplesSchema.parse(examples),
  };
  await publish(ports.artifacts, workspace, state.design, state.examples);
  return state;
}

/** The first run and every resume execute under the same exclusive claim. */
async function execute(
  ports: WorkflowPorts,
  workspace: string,
  manifest: RunManifest,
  onProgress: ((event: PipelineEvent) => void) | undefined,
  resume: boolean,
): Promise<RunResult> {
  const journal = createJournal(ports, workspace, manifest);
  let checkpoint: CheckpointHandle | undefined;
  try {
    checkpoint = ports.checkpoints.open(workspace);
    const graph = buildPipeline({
      model: ports.model,
      artifacts: ports.artifacts,
      workspace,
      onEvent: async (event) => {
        ports.trace.stageEvent(event.stage, event.kind);
        const safeEvent = event.detail
          ? { ...event, detail: ports.model.redact(event.detail) }
          : event;
        await journal.progress(safeEvent);
        onProgress?.(safeEvent);
      },
    }).compile({ checkpointer: checkpoint.saver });
    const state = await runStages(graph, ports, workspace, manifest, resume);
    await journal.finish('completed');
    return {
      runId: manifest.runId,
      workspace,
      readmePath: join(workspace, README_PATH),
      state,
    };
  } catch (error) {
    const message = ports.model.redact(errorMessage(error));
    if (manifest.status === 'running') await journal.finish('failed', message);
    const advice =
      error instanceof UnreadableCheckpoint
        ? 'Restore a valid checkpoint store before resuming, or start a new run.'
        : `Resume: npm start -- resume ${manifest.runId}`;
    // eslint-disable-next-line preserve-caught-error -- Raw causes may contain provider credentials.
    throw new Error(
      `Run ${manifest.runId} failed at ${manifest.stage ?? 'startup'}: ${message}. ${advice}`,
    );
  } finally {
    checkpoint?.close();
    await ports.trace.shutdown();
  }
}

export function createGenerateWorkflow(ports: WorkflowPorts): GenerateWorkflow {
  async function generate(command: GenerateCommand): Promise<RunResult> {
    const topic = command.topic.trim();
    if (ports.model.containsSecret(topic))
      throw new Error('The topic contains the configured credential.');
    const workspace = await ports.runStore.createWorkspace(topic);
    return ports.runStore.withLock(workspace.root, async () => {
      const manifest = createManifest({
        version: GRAPH_VERSION,
        runId: workspace.runId,
        topic,
        model: ports.model.identity(),
        now: new Date().toISOString(),
      });
      await ports.runStore.writeManifest(workspace.root, manifest);
      await createJournal(ports, workspace.root, manifest).event(
        'run_started',
        topic,
      );
      command.onRunStarted?.(workspace.runId, workspace.root);
      return execute(
        ports,
        workspace.root,
        manifest,
        command.onProgress,
        false,
      );
    });
  }

  async function resume(command: ResumeCommand): Promise<RunResult> {
    const workspace = ports.runStore.openWorkspace(command.runId);
    return ports.runStore.withLock(workspace.root, async () => {
      const manifest = ManifestSchema.parse(
        await ports.runStore.readManifest(workspace.root),
      );
      if (manifest.runId !== command.runId)
        throw new Error('Run id does not match manifest.');
      if (manifest.version !== GRAPH_VERSION)
        throw new Error(
          'The graph version has changed; generate a new run for this topic.',
        );
      if (manifest.status === 'completed')
        throw new Error('Run is already complete.');
      checkModel(manifest, ports.model.identity());
      manifest.status = 'running';
      manifest.stage = null;
      manifest.error = null;
      manifest.pid = process.pid;
      manifest.resumptions += 1;
      manifest.updatedAt = new Date().toISOString();
      await ports.runStore.writeManifest(workspace.root, manifest);
      await createJournal(ports, workspace.root, manifest).event('run_resumed');
      return execute(ports, workspace.root, manifest, command.onProgress, true);
    });
  }

  return { generate, resume };
}
