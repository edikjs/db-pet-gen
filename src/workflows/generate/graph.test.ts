import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { examples, FixtureModel } from '../../test-support';
import { buildPipeline, GRAPH_VERSION } from './graph';
import type { PipelineEvent } from './types';

describe('generation graph', () => {
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
    expect(GRAPH_VERSION).toBe(10);
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
