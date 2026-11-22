import { z } from 'zod';
import {
  DataModelSchema,
  OperationsSchema,
  SeedDataSchema,
} from './database.schema';
import { ProjectPlanSchema } from './plan.schema';

export const DesignAnswerSchema = ProjectPlanSchema.merge(
  DataModelSchema,
).extend({
  /** PostgreSQL DDL written by the model and checked against the design. */
  ddl: z.string().min(1),
});
/** The accepted design includes the ER source rendered from its checked tables. */
export const DesignSchema = DesignAnswerSchema.extend({
  mermaid: z.string().min(1),
});
export type Design = z.infer<typeof DesignSchema>;

/** The checked examples data produced by the second model stage. */
export const ExamplesAnswerSchema = SeedDataSchema.merge(
  OperationsSchema,
).extend({
  /** README written by the model and checked by Markdown validation. */
  readme: z.string().min(1),
});
export type ExamplesAnswer = z.infer<typeof ExamplesAnswerSchema>;
export const ExamplesSchema = ExamplesAnswerSchema.extend({
  seedSql: z.string().min(1),
  operationsSql: z.string().min(1),
});

/** The model review that compares generated SQL with the checked data. */
export const JudgeSchema = z.object({
  matches: z.boolean(),
  problems: z.array(z.string()),
});
export type Judge = z.infer<typeof JudgeSchema>;
export type Examples = z.infer<typeof ExamplesSchema>;
