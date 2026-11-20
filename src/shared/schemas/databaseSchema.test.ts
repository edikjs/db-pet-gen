import { codePlan, dataModel, seedData } from '../../test-support/fixture';
import {
  CodePlanSchema,
  DataModelSchema,
  SeedDataSchema,
} from './databaseSchema';

describe('database schemas', () => {
  it('accepts the shared fixtures', () => {
    expect(DataModelSchema.parse(dataModel)).toEqual(dataModel);
    expect(SeedDataSchema.parse(seedData)).toEqual(seedData);
    expect(CodePlanSchema.parse(codePlan)).toEqual(codePlan);
  });

  it('rejects identifiers that would break unquoted SQL or code', () => {
    const bad = structuredClone(dataModel);
    bad.tables[0].name = 'user';
    expect(DataModelSchema.safeParse(bad).success).toBe(false);
  });
});
