import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { createArtifactSink } from '../../adapters/artifacts';
import { createModelPort, type ChatTransport } from '../../adapters/llm';
import { createTraceAdapter } from '../../adapters/observability';
import { createCheckpointer, createRunStore } from '../../adapters/run-store';
import { design, FixtureModel, operationsSql } from '../../adapters/testing';
import { loadConfig } from '../../config';
import type { GenerateWorkflow } from '../ports';
import { createGenerateWorkflow } from './useCase';

/** The use case with real adapters and an injected fake chat transport. */
function workflowFor(
  runsDir: string,
  model: ChatTransport = new FixtureModel(),
  overrides: Record<string, string> = {},
): GenerateWorkflow {
  const config = loadConfig({
    LLM_PROVIDER: 'openrouter',
    LLM_MODEL: 'fixture',
    LLM_API_KEY: 'test-key',
    RUNS_DIR: runsDir,
    ...overrides,
  });
  return createGenerateWorkflow({
    model: createModelPort(config.chat, model),
    runStore: createRunStore(config.runsDir),
    checkpoints: createCheckpointer(),
    artifacts: createArtifactSink(),
    trace: createTraceAdapter(config.observability),
  });
}

describe('a topic-only generation run', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'db-pet-gen-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects topics that could escape SQL comments before creating a run', async () => {
    await expect(
      workflowFor(root).generate({ topic: 'Pets\nDROP TABLE owners;' }),
    ).rejects.toThrow(/one line/u);
    expect(await readdir(root)).toEqual([]);
  });

  it('writes Markdown, SQL, manifest, QA and a structured event log', async () => {
    const model = new FixtureModel();
    const run = await workflowFor(root, model).generate({
      topic: 'Pet records',
    });
    const readme = await readFile(run.readmePath, 'utf8');
    const ddl = await readFile(
      join(run.workspace, 'assets/ddl/schema.sql'),
      'utf8',
    );
    const seed = await readFile(
      join(run.workspace, 'assets/seed/seed.sql'),
      'utf8',
    );
    const er = await readFile(
      join(run.workspace, 'assets/diagrams/er.mmd'),
      'utf8',
    );
    const events = (await readFile(join(run.workspace, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row) as { kind: string });
    const manifest = JSON.parse(
      await readFile(join(run.workspace, 'run.json'), 'utf8'),
    ) as { status: string; topic: string };
    const qa = JSON.parse(
      await readFile(join(run.workspace, 'qa-report.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(readme).toContain('Pet records');
    expect(ddl).toContain('create table "pets"');
    expect(seed).toContain('insert into "owners" ("id", "name")');
    const operationsPath = 'assets/operations/operations.sql';
    expect(readme).toContain(`](${operationsPath})`);
    expect(await readFile(join(run.workspace, operationsPath), 'utf8')).toBe(
      operationsSql,
    );
    expect(er).toContain('"owners" ||--o{ "pets" : "owner_id"');
    expect(readme).toContain(`\`\`\`mermaid\n${er}\`\`\``);
    expect(await readdir(join(run.workspace, 'assets'))).toEqual([
      'ddl',
      'diagrams',
      'operations',
      'seed',
    ]);
    expect(manifest).toMatchObject({
      status: 'completed',
      topic: 'Pet records',
    });
    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['run_started', 'stage_started', 'run_completed']),
    );
    expect(qa).toEqual({ verdict: 'pass' });
    expect(model.calls).toEqual(['design', 'examples', 'judge']);
  });

  it('fails the run when the model returns an unusable design', async () => {
    class InvalidDesignModel extends FixtureModel {
      override async invoke(messages: BaseMessage[]): Promise<BaseMessage> {
        if (String(messages[0]?.content).includes('STAGE:design'))
          return new AIMessage(JSON.stringify({ title: 'Too short' }));
        return super.invoke(messages);
      }
    }
    await expect(
      workflowFor(root, new InvalidDesignModel()).generate({
        topic: 'Pet records',
      }),
    ).rejects.toThrow(/usable design/u);
    const [runId] = await readdir(root);
    const log = await readFile(join(root, runId, 'events.jsonl'), 'utf8');
    expect(log).toContain('"kind":"stage_failed"');
    expect(log).toContain('"stage":"design"');
  });

  it('resumes the failed stage without repeating completed model calls', async () => {
    await expect(
      workflowFor(root, new FixtureModel('examples')).generate({
        topic: 'Pet records',
      }),
    ).rejects.toThrow(/Resume:/u);
    const [runId] = await readdir(root);
    const model = new FixtureModel();
    const result = await workflowFor(root, model).resume({ runId });
    expect(result.readmePath).toContain('README.md');
    expect(model.calls).toEqual(['examples', 'judge']);
    expect(result.state.design?.mermaid).toBe(design.mermaid);
    const manifest = JSON.parse(
      await readFile(join(result.workspace, 'run.json'), 'utf8'),
    ) as { status: string; resumptions: number };
    expect(manifest).toMatchObject({ status: 'completed', resumptions: 1 });
  });

  it('refuses a different model when resuming an existing run', async () => {
    await expect(
      workflowFor(root, new FixtureModel('examples')).generate({
        topic: 'Pet records',
      }),
    ).rejects.toThrow();
    const [runId] = await readdir(root);
    await expect(
      workflowFor(root, new FixtureModel(), {
        LLM_MODEL: 'another-model',
      }).resume({
        runId,
      }),
    ).rejects.toThrow(/same LLM_/u);
  });

  it('allows exactly one resume to change a failed manifest', async () => {
    await expect(
      workflowFor(root, new FixtureModel('examples')).generate({
        topic: 'Pet records',
      }),
    ).rejects.toThrow();
    const [runId] = await readdir(root);
    const contenders = [new FixtureModel(), new FixtureModel()];
    const results = await Promise.allSettled(
      contenders.map((model) => workflowFor(root, model).resume({ runId })),
    );
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      results.find((r) => r.status === 'rejected')?.reason.message,
    ).toContain('database is locked');
    expect(contenders.flatMap((m) => m.calls)).toEqual(['examples', 'judge']);
    expect(
      JSON.parse(await readFile(join(root, runId, 'run.json'), 'utf8'))
        .resumptions,
    ).toBe(1);
  });

  it('republishes terminal checkpoint contents without model calls or PID checks', async () => {
    const run = await workflowFor(root).generate({ topic: 'Pet records' });
    const file = join(run.workspace, 'run.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(
      file,
      JSON.stringify({ ...manifest, status: 'running', pid: process.pid }),
    );
    await rm(run.readmePath);
    const seedPath = join(run.workspace, 'assets/seed/seed.sql');
    await rm(seedPath);
    await writeFile(join(run.workspace, 'qa-report.json'), '{}');
    const model = new FixtureModel();
    await workflowFor(root, model).resume({ runId: run.runId });
    expect(model.calls).toEqual([]);
    expect(await readFile(run.readmePath, 'utf8')).toBe(
      run.state.examples?.readme,
    );
    expect(await readFile(seedPath, 'utf8')).toBe(run.state.examples?.seedSql);
    expect(
      JSON.parse(await readFile(join(run.workspace, 'qa-report.json'), 'utf8')),
    ).toEqual({ verdict: 'pass' });
    expect(JSON.parse(await readFile(file, 'utf8')).status).toBe('completed');
  });

  it('restarts a missing checkpoint and persists its new thread for the next resume', async () => {
    await expect(
      workflowFor(root, new FixtureModel('judge')).generate({ topic: 'Pets' }),
    ).rejects.toThrow();
    const [runId] = await readdir(root);
    await rm(join(root, runId, 'checkpoints.db'));
    const restart = new FixtureModel('examples');
    await expect(
      workflowFor(root, restart).resume({ runId }),
    ).rejects.toThrow();
    expect(restart.calls).toEqual(['design', 'examples']);
    const model = new FixtureModel();
    await workflowFor(root, model).resume({ runId });
    expect(model.calls).toEqual(['examples', 'judge']);
  });

  it('does not publish a contradictory judge verdict', async () => {
    const fixture = new FixtureModel();
    let reviews = 0;
    const model: ChatTransport = {
      invoke: async (messages) => {
        if (String(messages[0].content).startsWith('STAGE:judge')) {
          reviews++;
          return new AIMessage(
            JSON.stringify({ matches: true, problems: ['Missing constraint'] }),
          );
        }
        return fixture.invoke(messages);
      },
    };
    await expect(
      workflowFor(root, model).generate({ topic: 'Pet records' }),
    ).rejects.toThrow('Missing constraint');
    expect(reviews).toBe(2);
    const [runId] = await readdir(root);
    expect(await readdir(join(root, runId))).not.toContain('README.md');
    expect(
      JSON.parse(await readFile(join(root, runId, 'qa-report.json'), 'utf8'))
        .verdict,
    ).toBe('failed');
  });

  it('does not silently restart an unreadable checkpoint', async () => {
    await expect(
      workflowFor(root, new FixtureModel('examples')).generate({
        topic: 'Pets',
      }),
    ).rejects.toThrow();
    const [runId] = await readdir(root);
    await writeFile(join(root, runId, 'checkpoints.db'), 'damaged journal');
    const model = new FixtureModel();
    await expect(workflowFor(root, model).resume({ runId })).rejects.toThrow(
      /restore a valid checkpoint/i,
    );
    expect(model.calls).toEqual([]);
  });

  it('blocks a credential in the topic before creating files, and in a reply before checkpointing', async () => {
    const key = 'test-key';
    await expect(
      workflowFor(root).generate({ topic: `pets ${key}` }),
    ).rejects.toThrow('credential');
    expect(await readdir(root)).toEqual([]);
    const model: ChatTransport = {
      invoke: jest.fn(
        async () => new AIMessage(JSON.stringify({ ...design, title: key })),
      ),
    };
    await expect(
      workflowFor(root, model).generate({ topic: 'Pets' }),
    ).rejects.toThrow('provider request failed');
    expect(model.invoke).toHaveBeenCalledTimes(1);
    const [runId] = await readdir(root);
    const workspace = join(root, runId);
    for (const file of await readdir(workspace))
      expect(
        (await readFile(join(workspace, file))).includes(Buffer.from(key)),
      ).toBe(false);
  });
});
