import {
  design,
  examples,
  operationsSql,
  seedSql,
} from '../../src/adapters/testing/fixtures';
import type { Examples } from '../../src/workflows/generate/domain';
import { readmeSubstance } from './readmeSubstance';

const fullExamples: Examples = { ...examples, seedSql, operationsSql };

describe('readmeSubstance', () => {
  it('passes every content check for the checked fixture', () => {
    expect(
      readmeSubstance(design, fullExamples).every((check) => check.passed),
    ).toBe(true);
  });

  it('fails every content check when the README has no sections', () => {
    const checks = readmeSubstance(design, {
      ...fullExamples,
      readme: '# Pet records',
    });
    expect(checks.every((check) => !check.passed)).toBe(true);
  });
});
