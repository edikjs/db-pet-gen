import { StateGraph, START, END } from '@langchain/langgraph';
import { requireValue, stage } from './stage';
import { PipelineState } from './state';
import { runDesign, runExamples, runJudge, publish } from '../stages';
import type { PipelineOptions } from './types';

export const GRAPH_VERSION = 14;

/** A new run and a resume compile exactly the same graph. */
export function buildPipeline(options: PipelineOptions) {
  const { model, workspace, artifacts } = options;
  return new StateGraph(PipelineState)
    .addNode('designStage', (state) =>
      stage(options, 'design', async () => ({
        design: await runDesign(model, state.topic),
      })),
    )
    .addNode('examplesStage', (state) =>
      stage(options, 'examples', async () => {
        const design = requireValue(state.design, 'design');
        return { examples: await runExamples(model, state.topic, design) };
      }),
    )
    .addNode('judgeStage', (state) =>
      stage(options, 'judge', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        await runJudge(model, state.topic, design, examples);
        return {};
      }),
    )
    .addNode('publishStage', (state) =>
      stage(options, 'publish', async () => {
        const design = requireValue(state.design, 'design');
        const examples = requireValue(state.examples, 'examples');
        await publish(artifacts, workspace, design, examples);
        return {};
      }),
    )
    .addEdge(START, 'designStage')
    .addEdge('designStage', 'examplesStage')
    .addEdge('examplesStage', 'judgeStage')
    .addEdge('judgeStage', 'publishStage')
    .addEdge('publishStage', END);
}
