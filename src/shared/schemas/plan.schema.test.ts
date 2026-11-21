import { ProjectPlanSchema } from './plan.schema';
import { projectPlan } from '../../test-support';

it('validates a substantive topic-specific blueprint', () => {
  expect(ProjectPlanSchema.parse(projectPlan)).toEqual(projectPlan);
  expect(
    ProjectPlanSchema.safeParse({ ...projectPlan, summary: 'x' }).success,
  ).toBe(false);
});
