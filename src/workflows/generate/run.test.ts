import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { loadConfig } from '../../config';
import { resumeRun, runGenerate } from './run';
import { FixtureModel } from '../../test-support/fixture';

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

  it('writes Markdown, SQL, code, manifest, QA and a structured event log', async () => {
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
    const events = (await readFile(join(run.workspace, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row) as { kind: string });
    const manifest = JSON.parse(
      await readFile(join(run.workspace, 'run.json'), 'utf8'),
    ) as { status: string; topic: string };
    expect(readme).toContain('Pet records');
    expect(ddl).toContain('CREATE TABLE pets');
    expect(await readdir(join(run.workspace, 'assets/code'))).toContain(
      'services.ts',
    );
    expect(manifest).toMatchObject({
      status: 'completed',
      topic: 'Pet records',
    });
    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['run_started', 'stage_started', 'run_completed']),
    );
    expect(model.calls).toEqual(['plan', 'schema', 'seed', 'code']);
  });

  it('recovers from a model validation failure without losing the run', async () => {
    class FlakySeedModel extends FixtureModel {
      seedCalls = 0;
      private first = true;
      override async invoke(messages: BaseMessage[]): Promise<BaseMessage> {
        const answer = await super.invoke(messages);
        if (String(messages[0]?.content).includes('STAGE:seed')) {
          this.seedCalls += 1;
          if (this.first) {
            this.first = false;
            const invalid = {
              tables: [
                { table: 'owners', rows: [{ id: 1, name: 'Ada' }] },
                {
                  table: 'pets',
                  rows: [{ id: 10, owner_id: 999, name: 'Milo' }],
                },
              ],
            };
            return new AIMessage(JSON.stringify(invalid));
          }
        }
        return answer;
      }
    }
    const model = new FlakySeedModel();
    const result = await runGenerate({
      topic: 'Pet records',
      config: configFor(root),
      model,
    });
    const log = await readFile(join(result.workspace, 'events.jsonl'), 'utf8');
    expect(model.seedCalls).toBe(2);
    expect(log).toContain('"kind":"stage_finished"');
    expect(log).not.toContain('"kind":"stage_failed"');
  });

  it('resumes the failed stage without repeating completed model calls', async () => {
    const config = configFor(root);
    await expect(
      runGenerate({
        topic: 'Pet records',
        config,
        model: new FixtureModel('seed'),
      }),
    ).rejects.toThrow(/Resume:/u);
    const [runId] = await readdir(root);
    const model = new FixtureModel();
    const result = await resumeRun({ runId, config, model });
    expect(result.readmePath).toContain('README.md');
    expect(model.calls).toEqual(['seed', 'code']);
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
        model: new FixtureModel('seed'),
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
