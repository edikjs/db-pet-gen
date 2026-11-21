import { z } from 'zod';

/** A concise, English, topic-specific database project plan. */
export const ProjectPlanSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(20),
  assumptions: z.array(z.string().min(5)).min(1).max(6),
  features: z.array(z.string().min(5)).min(2).max(8),
});
export type ProjectPlan = z.infer<typeof ProjectPlanSchema>;
