import { z } from 'zod';
import {
  DataModelSchema,
  OperationsSchema,
  SeedDataSchema,
} from './database.schema';
import { ProjectPlanSchema } from './plan.schema';

/** The checked design data produced by the first model stage. */
export const DesignSchema = ProjectPlanSchema.merge(DataModelSchema).extend({
  /** Mermaid ER source written by the model and checked against the design. */
  mermaid: z.string().min(1),
  /** PostgreSQL DDL written by the model and checked against the design. */
  ddl: z.string().min(1),
});
export type Design = z.infer<typeof DesignSchema>;

/** The checked examples data produced by the second model stage. */
export const ExamplesSchema = SeedDataSchema.merge(OperationsSchema).extend({
  /** INSERT script written by the model and checked against the seed rows. */
  seedSql: z.string().min(1),
  /** README written by the model and checked by Markdown validation. */
  readme: z.string().min(1),
});

/** The model review that compares generated SQL with the checked data. */
export const JudgeSchema = z.object({
  matches: z.boolean(),
  problems: z.array(z.string()),
});
export type Judge = z.infer<typeof JudgeSchema>;
export type Examples = z.infer<typeof ExamplesSchema>;
