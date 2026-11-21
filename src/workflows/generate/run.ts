import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DesignSchema, ExamplesSchema } from '../../shared';
import type { AppConfig } from '../../config';
import { generationClient } from '../../llm';
import { createRunWorkspace, openRunWorkspace } from '../../io';
import { initObservability } from '../../adapters/observability';
import { buildPipeline, GRAPH_VERSION } from './graph';
import { publishArtifacts } from './artifacts';
import type {
  GenerateOptions,
  ResumeOptions,
  RunOptions,
  RunResult,
} from './types';
import {
  ManifestSchema,
  RunRecorder,
  openRunCheckpointer,
  withRunLock,
  writeManifest,
  type RunManifest,
} from './lifecycle';

class UnreadableCheckpoint extends Error {}

function threadConfig(runId: string) {
  return { configurable: { thread_id: runId } };
}

function checkModel(manifest: RunManifest, config: AppConfig): void {
  const current = config.chat;
  if (
    manifest.model.provider !== current.provider ||
    manifest.model.name !== current.model ||
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
  recorder: RunRecorder,
  resume: boolean,
) {
  const { manifest, workspace } = recorder;
  const config = threadConfig(manifest.threadId ?? manifest.runId);
  const initial = { topic: manifest.topic, design: null, examples: null };
  if (!resume) return graph.invoke(initial, config);

  const snapshot = await graph.getState(config).catch(() => {
    throw new UnreadableCheckpoint('Cannot read checkpoints.db.');
  });
  if (!snapshot.createdAt) {
    manifest.threadId = randomUUID();
    await writeManifest(join(workspace, 'run.json'), manifest);
    await recorder.event('checkpoint_missing', 'Restarting from design.');
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
  await publishArtifacts(workspace, state.design, state.examples);
  return state;
}

/** The first run and every resume execute under the same exclusive claim. */
async function execute(
  recorder: RunRecorder,
  options: RunOptions,
  resume: boolean,
): Promise<RunResult> {
  let handle: ReturnType<typeof openRunCheckpointer> | undefined;
  let observability: ReturnType<typeof initObservability>;
  try {
    handle = openRunCheckpointer(recorder.workspace);
    observability = initObservability(options.config.observability);
    const graph = buildPipeline({
      model: generationClient(options.config.chat, options.model),
      workspace: recorder.workspace,
      onEvent: async (event) => {
        observability?.stageEvent(event.stage, event.kind);
        const safeEvent = event.detail
          ? { ...event, detail: recorder.redact(event.detail) }
          : event;
        await recorder.progress(safeEvent);
        options.onProgress?.(safeEvent);
      },
    }).compile({ checkpointer: handle.saver });
    const state = await runStages(graph, recorder, resume);
    await recorder.finish('completed');
    return {
      runId: recorder.manifest.runId,
      workspace: recorder.workspace,
      readmePath: join(recorder.workspace, 'README.md'),
      state,
    };
  } catch (error) {
    const message = recorder.redact(
      error instanceof Error ? error.message : String(error),
    );
    if (recorder.manifest.status === 'running')
      await recorder.finish('failed', message);
    const advice =
      error instanceof UnreadableCheckpoint
        ? 'Restore a valid checkpoint store before resuming, or start a new run.'
        : `Resume: npm start -- resume ${recorder.manifest.runId}`;
    // eslint-disable-next-line preserve-caught-error -- Raw causes may contain provider credentials.
    throw new Error(
      `Run ${recorder.manifest.runId} failed at ${recorder.manifest.stage ?? 'startup'}: ${message}. ${advice}`,
    );
  } finally {
    handle?.close();
    await observability?.shutdown();
  }
}

export async function runGenerate(
  options: GenerateOptions,
): Promise<RunResult> {
  const topic = options.topic.trim();
  if (options.config.chat.apiKey && topic.includes(options.config.chat.apiKey))
    throw new Error('The topic contains the configured credential.');
  const workspace = await createRunWorkspace(options.config.runsDir, topic);
  return withRunLock(workspace.root, async () => {
    const now = new Date().toISOString();
    const manifest: RunManifest = {
      version: GRAPH_VERSION,
      runId: workspace.runId,
      topic,
      status: 'running',
      stage: null,
      startedAt: now,
      updatedAt: now,
      pid: process.pid,
      resumptions: 0,
      error: null,
      stages: {},
      model: {
        provider: options.config.chat.provider,
        name: options.config.chat.model,
        baseUrl: options.config.chat.baseUrl,
        temperature: options.config.chat.temperature,
      },
    };
    await writeManifest(join(workspace.root, 'run.json'), manifest);
    const recorder = new RunRecorder(
      workspace.root,
      manifest,
      options.config.chat.apiKey,
    );
    await recorder.event('run_started', topic);
    options.onRunStarted?.(workspace.runId, workspace.root);
    return execute(recorder, options, false);
  });
}

export async function resumeRun(options: ResumeOptions): Promise<RunResult> {
  const workspace = openRunWorkspace(options.config.runsDir, options.runId);
  return withRunLock(workspace.root, async () => {
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(join(workspace.root, 'run.json'), 'utf8')),
    );
    if (manifest.runId !== options.runId)
      throw new Error('Run id does not match manifest.');
    if (manifest.version !== GRAPH_VERSION)
      throw new Error(
        'The graph version has changed; generate a new run for this topic.',
      );
    if (manifest.status === 'completed')
      throw new Error('Run is already complete.');
    checkModel(manifest, options.config);
    manifest.status = 'running';
    manifest.stage = null;
    manifest.error = null;
    manifest.pid = process.pid;
    manifest.resumptions += 1;
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(join(workspace.root, 'run.json'), manifest);
    const recorder = new RunRecorder(
      workspace.root,
      manifest,
      options.config.chat.apiKey,
    );
    await recorder.event('run_resumed');
    return execute(recorder, options, true);
  });
}
