import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureModel } from '../../test-support/fixture';
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
      'renderStage',
      'publishStage',
    ]);
    expect([...graph.edges]).toEqual([
      ['__start__', 'designStage'],
      ['designStage', 'examplesStage'],
      ['examplesStage', 'renderStage'],
      ['renderStage', 'publishStage'],
      ['publishStage', '__end__'],
    ]);
    expect(GRAPH_VERSION).toBe(2);
  });

  it('asks the model twice and reports every stage', async () => {
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
        output: null,
      });
      expect(model.calls).toEqual(['design', 'examples']);
      expect(
        events
          .filter((event) => event.kind === 'stage_started')
          .map((event) => event.stage),
      ).toEqual(['design', 'examples', 'render', 'publish']);
      expect(state.output?.checks).toEqual({
        sql: 'passed',
        mermaid: 'passed',
        markdown: 'passed',
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
