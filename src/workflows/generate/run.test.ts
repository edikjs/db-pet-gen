import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { loadConfig } from '../../config';
import { resumeRun, runGenerate } from './run';
import { FixtureModel } from '../../test-support';

describe('a topic-only generation run', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'db-pet-gen-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const configFor = (runsDir: string) =>
    loadConfig({
      LLM_PROVIDER: 'openrouter',
      LLM_MODEL: 'fixture',
      LLM_API_KEY: 'test-key',
      RUNS_DIR: runsDir,
    });

  it('rejects topics that could escape SQL comments before creating a run', async () => {
    await expect(
      runGenerate({
        topic: 'Pets\nDROP TABLE owners;',
        config: configFor(root),
        model: new FixtureModel(),
      }),
    ).rejects.toThrow(/one line/u);
    expect(await readdir(root)).toEqual([]);
  });

  it('writes Markdown, SQL, manifest, QA and a structured event log', async () => {
    const model = new FixtureModel();
    const run = await runGenerate({
      topic: 'Pet records',
      config: configFor(root),
      model,
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
    expect(er).toContain('owners ||--o{ pets : owner_id');
    expect(await readdir(join(run.workspace, 'assets'))).toEqual([
      'ddl',
      'diagrams',
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
    const config = configFor(root);
    await expect(
      runGenerate({
        topic: 'Pet records',
        config,
        model: new InvalidDesignModel(),
      }),
    ).rejects.toThrow(/usable design/u);
    const [runId] = await readdir(root);
    const log = await readFile(join(root, runId, 'events.jsonl'), 'utf8');
    expect(log).toContain('"kind":"stage_failed"');
    expect(log).toContain('"stage":"design"');
  });

  it('resumes the failed stage without repeating completed model calls', async () => {
    const config = configFor(root);
    await expect(
      runGenerate({
        topic: 'Pet records',
        config,
        model: new FixtureModel('examples'),
      }),
    ).rejects.toThrow(/Resume:/u);
    const [runId] = await readdir(root);
    const model = new FixtureModel();
    const result = await resumeRun({ runId, config, model });
    expect(result.readmePath).toContain('README.md');
    expect(model.calls).toEqual(['examples', 'judge']);
    const manifest = JSON.parse(
      await readFile(join(result.workspace, 'run.json'), 'utf8'),
    ) as { status: string; resumptions: number };
    expect(manifest).toMatchObject({ status: 'completed', resumptions: 1 });
  });

  it('refuses a different model when resuming an existing run', async () => {
    const config = configFor(root);
    await expect(
      runGenerate({
        topic: 'Pet records',
        config,
        model: new FixtureModel('examples'),
      }),
    ).rejects.toThrow();
    const [runId] = await readdir(root);
    const changed = {
      ...config,
      chat: { ...config.chat, model: 'another-model' },
    };
    await expect(
      resumeRun({ runId, config: changed, model: new FixtureModel() }),
    ).rejects.toThrow(/same LLM_/u);
  });
});
