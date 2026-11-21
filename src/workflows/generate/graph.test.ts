import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import mermaid from 'mermaid';
import { design, diagram, examples, FixtureModel } from '../../test-support';
import { buildPipeline, GRAPH_VERSION } from './graph';
import type { PipelineEvent } from './types';

describe('generation graph', () => {
  it('publishes both foreign keys to one parent, including combined key markers', async () => {
    const answer = structuredClone(design);
    const petId = answer.tables[1].columns[0];
    petId.references = { table: 'owners', column: 'id' };
    petId.unique = true;
    petId.comment = 'Free-form text never goes into the diagram.';
    answer.ddl = answer.ddl.replace(
      'constraint "fk_pets_owner_id"',
      'foreign key ("id") references "owners" ("id"), constraint "fk_pets_owner_id"',
    );
    const expected = diagram
      .replace(
        '"pets" {\n  INTEGER `id` PK',
        '"pets" {\n  INTEGER `id` PK, FK, UK',
      )
      .replace(
        '"owners" ||--o{',
        '"owners" ||--o| "pets" : "id"\n"owners" ||--o{',
      );
    const sample = structuredClone(examples);
    sample.tables[1].rows.forEach((row) => {
      row.id = row.owner_id;
    });
    sample.seedSql = sample.seedSql
      .replace('(10,', '(1,')
      .replace('(11,', '(2,');
    sample.readme = sample.readme.replace(diagram, expected);
    const workspace = await mkdtemp(join(tmpdir(), 'db-pet-graph-'));
    try {
      const fixture = new FixtureModel();
      const graph = buildPipeline({
        workspace,
        model: {
          async invoke(messages) {
            const stage = String(messages[0].content);
            if (stage.startsWith('STAGE:design'))
              return new AIMessage(JSON.stringify(answer));
            if (stage.startsWith('STAGE:examples'))
              return new AIMessage(JSON.stringify(sample));
            return fixture.invoke(messages);
          },
        },
      }).compile();
      await graph.invoke({
        topic: 'Pet records',
        design: null,
        examples: null,
      });
      const er = await readFile(
        join(workspace, 'assets/diagrams/er.mmd'),
        'utf8',
      );
      expect(er).toBe(expected);
      expect(await mermaid.parse(er)).toMatchObject({ diagramType: 'er' });
      expect(await readFile(join(workspace, 'README.md'), 'utf8')).toContain(
        `\`\`\`mermaid\n${er}\`\`\``,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('does not request a model correction for a renderer failure', async () => {
    const parser = jest
      .spyOn(mermaid, 'parse')
      .mockRejectedValueOnce(new Error('renderer failed'));
    const model = new FixtureModel();
    try {
      const graph = buildPipeline({ model, workspace: tmpdir() }).compile();
      await expect(
        graph.invoke({ topic: 'Pets', design: null, examples: null }),
      ).rejects.toThrow('renderer failed');
      expect(model.calls).toEqual(['design']);
    } finally {
      parser.mockRestore();
    }
  });
  it('rejects orphan rows before review even when the INSERT matches the seed data', async () => {
    const invalid = structuredClone(examples);
    invalid.tables[1].rows[0].owner_id = 999;
    invalid.seedSql = invalid.seedSql.replace('(10, 1,', '(10, 999,');
    const fixture = new FixtureModel();
    const workspace = await mkdtemp(join(tmpdir(), 'db-pet-graph-'));
    try {
      const graph = buildPipeline({
        workspace,
        model: {
          invoke: async (messages) =>
            String(messages[0].content).startsWith('STAGE:examples')
              ? new AIMessage(JSON.stringify(invalid))
              : fixture.invoke(messages),
        },
      }).compile();
      await expect(
        graph.invoke({ topic: 'Pet records', design: null, examples: null }),
      ).rejects.toThrow('no matching seed row');
      expect(fixture.calls).toEqual(['design']);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
  it('wires the four stages in order', () => {
    const graph = buildPipeline({
      model: new FixtureModel(),
      workspace: '/tmp',
    });
    expect(Object.keys(graph.nodes)).toEqual([
      'designStage',
      'examplesStage',
      'judgeStage',
      'publishStage',
    ]);
    expect([...graph.edges]).toEqual([
      ['__start__', 'designStage'],
      ['designStage', 'examplesStage'],
      ['examplesStage', 'judgeStage'],
      ['judgeStage', 'publishStage'],
      ['publishStage', '__end__'],
    ]);
    expect(GRAPH_VERSION).toBe(12);
  });

  it('asks the model for each generation stage and reports every stage', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'db-pet-graph-'));
    try {
      const model = new FixtureModel();
      const events: PipelineEvent[] = [];
      const pipeline = buildPipeline({
        model,
        workspace,
        onEvent: (event) => {
          events.push(event);
        },
      }).compile();
      const state = await pipeline.invoke({
        topic: 'Pet records',
        design: null,
        examples: null,
      });
      expect(model.calls).toEqual(['design', 'examples', 'judge']);
      expect(
        events
          .filter((event) => event.kind === 'stage_started')
          .map((event) => event.stage),
      ).toEqual(['design', 'examples', 'judge', 'publish']);
      expect(state.design?.tables).toHaveLength(2);
      expect(state.examples?.readme).toContain('Pet records');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
