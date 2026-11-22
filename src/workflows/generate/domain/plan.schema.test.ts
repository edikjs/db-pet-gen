import { ProjectPlanSchema } from './plan.schema';
import { projectPlan } from '../../../adapters/testing';

it('validates a substantive topic-specific blueprint', () => {
  expect(ProjectPlanSchema.parse(projectPlan)).toEqual(projectPlan);
  expect(
    ProjectPlanSchema.safeParse({ ...projectPlan, summary: 'x' }).success,
  ).toBe(false);
});
