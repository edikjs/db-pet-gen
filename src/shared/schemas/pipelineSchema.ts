import { z } from 'zod';
import {
  DataModelSchema,
  OperationsSchema,
  SeedDataSchema,
} from './databaseSchema';
import { ProjectPlanSchema } from './planSchema';

/** The checked design data produced by the first model stage. */
export const DesignSchema = ProjectPlanSchema.merge(DataModelSchema);
export type Design = z.infer<typeof DesignSchema>;

/** The checked examples data produced by the second model stage. */
export const ExamplesSchema = SeedDataSchema.merge(OperationsSchema);
export type Examples = z.infer<typeof ExamplesSchema>;
