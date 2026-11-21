import { dataModel, design, operations, seedData } from '../../test-support';
import { DesignSchema } from './pipeline.schema';
import type { DataModel } from './database.schema';
import {
  DataModelSchema,
  OperationsSchema,
  SeedDataSchema,
} from './database.schema';

describe('database schemas', () => {
  it('accepts the shared fixtures', () => {
    expect(DataModelSchema.parse(dataModel)).toEqual(dataModel);
    expect(SeedDataSchema.parse(seedData)).toEqual(seedData);
    expect(OperationsSchema.parse(operations)).toEqual(operations);
  });

  it('rejects identifiers that would break unquoted SQL or code', () => {
    const bad = structuredClone(dataModel);
    bad.tables[0].name = 'user';
    expect(DataModelSchema.safeParse(bad).success).toBe(false);
  });

  it.each<[string, (model: DataModel) => void]>([
    [
      'missing primary key',
      ({ tables }) => {
        tables[0].columns[0].primaryKey = false;
      },
    ],
    [
      'nullable primary key',
      ({ tables }) => {
        tables[0].columns[0].nullable = true;
      },
    ],
    [
      'duplicate table',
      ({ tables }) => {
        tables.push(tables[0]);
      },
    ],
    [
      'duplicate column',
      ({ tables }) => {
        tables[0].columns.push(tables[0].columns[1]);
      },
    ],
    [
      'index name colliding with a table',
      ({ tables }) => {
        tables[1].indexes[0].name = 'owners';
      },
    ],
    [
      'missing index column',
      ({ tables }) => {
        tables[1].indexes[0].columns = ['absent'];
      },
    ],
    [
      'no foreign key',
      ({ tables }) => {
        tables[1].columns[1].references = null;
      },
    ],
    [
      'parent listed later',
      ({ tables }) => {
        tables.reverse();
      },
    ],
    [
      'missing parent',
      ({ tables }) => {
        tables[1].columns[1].references!.table = 'absent';
      },
    ],
    [
      'missing parent column',
      ({ tables }) => {
        tables[1].columns[1].references!.column = 'absent';
      },
    ],
    [
      'mismatched FK type',
      ({ tables }) => {
        tables[1].columns[1].type = 'TEXT';
      },
    ],
    [
      'one member of a composite PK as FK target',
      ({ tables }) => {
        tables[0].columns[1].primaryKey = true;
      },
    ],
  ])('rejects %s in the actual design stage schema', (_label, mutate) => {
    const candidate = structuredClone(design);
    mutate(candidate);
    expect(DesignSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([1, 6])('rejects %i seed rows in a table', (count) => {
    const seed = structuredClone(seedData);
    seed.tables[0].rows = Array(count).fill(seed.tables[0].rows[0]);
    expect(SeedDataSchema.safeParse(seed).success).toBe(false);
  });

  it('allows a foreign key to a same-type unique non-primary column', () => {
    const model = structuredClone(dataModel);
    model.tables[0].columns[1].unique = true;
    Object.assign(model.tables[1].columns[1], {
      type: 'TEXT',
      references: { table: 'owners', column: 'name' },
    });
    expect(DataModelSchema.safeParse(model).success).toBe(true);
    model.tables[0].columns[1].unique = false;
    expect(DataModelSchema.safeParse(model).success).toBe(false);
  });
});
