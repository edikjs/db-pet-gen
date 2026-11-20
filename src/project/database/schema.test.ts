import { codePlan, dataModel, seedData } from '../../test-support/fixture';
import {
  DataModelSchema,
  verifyCodePlan,
  verifyDataModel,
  verifySeedData,
} from './schema';

describe('structured artifact checks', () => {
  it('accepts a matching schema, seed and operations', () => {
    expect(verifyDataModel(dataModel)).toEqual([]);
    expect(verifySeedData(seedData, dataModel)).toEqual([]);
    expect(verifyCodePlan(codePlan, dataModel)).toEqual([]);
  });

  it('rejects invalid and out-of-order foreign keys', () => {
    const reversed = { tables: [...dataModel.tables].reverse() };
    expect(verifyDataModel(reversed)).toContain(
      'List the referenced table before pets: owners',
    );
    const broken = structuredClone(dataModel);
    broken.tables[1].columns[1].references = {
      table: 'owners',
      column: 'missing',
    };
    expect(verifyDataModel(broken)).toContain(
      'Invalid foreign key: pets.owner_id',
    );
  });

  it('rejects unknown columns, duplicate keys and missing referenced rows', () => {
    const bad = structuredClone(seedData);
    bad.tables[1].rows[0].owner_id = 99;
    bad.tables[1].rows[1].id = 10;
    expect(verifySeedData(bad, dataModel)).toEqual(
      expect.arrayContaining([
        'Unresolved foreign key: pets.owner_id',
        'Duplicate primary key: pets',
      ]),
    );
  });

  it('rejects extra statements and unbound parameters', () => {
    const bad = structuredClone(codePlan);
    bad.operations[0].statement += '; DROP TABLE pets';
    expect(verifyCodePlan(bad, dataModel)).toContain(
      'Invalid SQL statement: list_pets_by_owner',
    );
  });

  it('rejects unlisted tables and unbounded writes', () => {
    const bad = structuredClone(codePlan);
    bad.operations[0].statement =
      'SELECT pets.id FROM pets JOIN owners ON owners.id = pets.owner_id';
    bad.operations[1].statement = 'DELETE FROM pets';
    expect(verifyCodePlan(bad, dataModel)).toEqual(
      expect.arrayContaining([
        'SQL uses unlisted table owners: list_pets_by_owner',
        'Write operation needs a WHERE clause: remove_pet',
      ]),
    );
  });

  it('rejects identifiers that would break unquoted SQL or code', () => {
    const bad = structuredClone(dataModel);
    bad.tables[0].name = 'user';
    expect(DataModelSchema.safeParse(bad).success).toBe(false);
  });
});
