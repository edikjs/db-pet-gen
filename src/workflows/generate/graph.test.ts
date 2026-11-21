import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureModel } from '../../test-support';
import { buildPipeline, GRAPH_VERSION } from './graph';
import type { PipelineEvent } from './types';

describe('generation graph', () => {
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
    expect(GRAPH_VERSION).toBe(8);
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
