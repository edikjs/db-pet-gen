import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../config';
import { createChatModel, type GenerationModel } from '../../llm';
import { createRunWorkspace, openRunWorkspace } from '../../io';
import { initObservability } from '../../adapters/observability';
import {
  buildPipeline,
  GRAPH_VERSION,
  type PipelineEvent,
  type PipelineResult,
} from './graph';
import {
  ManifestSchema,
  RunRecorder,
  openRunCheckpointer,
  writeManifest,
  type RunManifest,
} from './lifecycle';

export interface RunResult {
  runId: string;
  workspace: string;
  readmePath: string;
  state: PipelineResult;
}

export interface RunOptions {
  config: AppConfig;
  model?: GenerationModel;
  onProgress?: (event: PipelineEvent) => void;
}

export interface GenerateOptions extends RunOptions {
  topic: string;
  onRunStarted?: (runId: string, workspace: string) => void;
}

export interface ResumeOptions extends RunOptions {
  runId: string;
}

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

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The first run and every resume build the same graph and use one run-id thread. */
async function execute(
  recorder: RunRecorder,
  options: RunOptions,
  resume: boolean,
): Promise<RunResult> {
  let handle: ReturnType<typeof openRunCheckpointer> | undefined;
  let observability: Awaited<ReturnType<typeof initObservability>>;
  try {
    handle = openRunCheckpointer(recorder.workspace);
    observability = await initObservability(options.config.observability);
    const graph = buildPipeline({
      model: options.model ?? createChatModel(options.config.chat),
      workspace: recorder.workspace,
      onEvent: async (event) => {
        const safeEvent = event.detail
          ? { ...event, detail: recorder.redact(event.detail) }
          : event;
        await recorder.progress(safeEvent);
        options.onProgress?.(safeEvent);
      },
    }).compile({ checkpointer: handle.saver });
    const config = threadConfig(recorder.manifest.runId);
    if (resume) {
      const pending = await graph.getState(config);
      if (!pending.next.length)
        throw new Error('The run has no pending stage to resume.');
    }
    const state = await graph.invoke(
      resume
        ? null
        : {
            topic: recorder.manifest.topic,
            plan: null,
            database: null,
            seed: null,
            codePlan: null,
            output: null,
          },
      config,
    );
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
    throw new Error(
      `Run ${recorder.manifest.runId} failed at ${recorder.manifest.stage ?? 'startup'}: ${message}. Resume: npm start -- resume ${recorder.manifest.runId}`,
      { cause: error },
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
  const workspace = await createRunWorkspace(options.config.runsDir, topic);
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
}

export async function resumeRun(options: ResumeOptions): Promise<RunResult> {
  const workspace = openRunWorkspace(options.config.runsDir, options.runId);
  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(join(workspace.root, 'run.json'), 'utf8')),
  );
  if (manifest.runId !== options.runId)
    throw new Error('Run id does not match manifest.');
  if (manifest.version !== GRAPH_VERSION)
    throw new Error(
      'The graph version has changed; this run cannot be resumed.',
    );
  if (manifest.status === 'completed')
    throw new Error('Run is already complete.');
  if (manifest.status === 'running' && processAlive(manifest.pid))
    throw new Error(`Run ${options.runId} is still owned by a live process.`);
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
}
