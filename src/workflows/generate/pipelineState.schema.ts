import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import { DesignSchema, ExamplesSchema } from '../../shared';

export const PipelineState = new StateSchema({
  topic: z.string(),
  design: DesignSchema.nullable().default(null),
  examples: ExamplesSchema.nullable().default(null),
});
export type PipelineResult = typeof PipelineState.State;
