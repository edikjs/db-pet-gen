import { dataModel, seedData } from '../../../adapters/testing';
import type { SeedData } from './database.schema';
import { validateSeedData } from './seedIntegrity';

it.each<[string, (seed: SeedData) => void]>([
  [
    'missing table',
    ({ tables }) => {
      tables.pop();
    },
  ],
  [
    'extra table',
    ({ tables }) => {
      tables.push({ table: 'extra', rows: [] });
    },
  ],
  [
    'duplicate table',
    ({ tables }) => {
      tables[1] = tables[0];
    },
  ],
  [
    'wrong order',
    ({ tables }) => {
      tables.reverse();
    },
  ],
  [
    'unknown column',
    ({ tables }) => {
      tables[0].rows[0].other = 1;
    },
  ],
  [
    'missing column',
    ({ tables }) => {
      delete tables[0].rows[0].name;
    },
  ],
  [
    'non-integer key',
    ({ tables }) => {
      tables[1].rows[0].id = 0.5;
    },
  ],
  [
    'null required value',
    ({ tables }) => {
      tables[0].rows[0].name = null;
    },
  ],
  [
    'duplicate primary key',
    ({ tables }) => {
      tables[1].rows[0].id = tables[1].rows[1].id;
    },
  ],
  [
    'missing parent row',
    ({ tables }) => {
      tables[1].rows[0].owner_id = 999;
    },
  ],
])('rejects seed data with %s', (_label, mutate) => {
  const seed = structuredClone(seedData);
  mutate(seed);
  expect(validateSeedData(seed, dataModel)).not.toEqual([]);
});

it('checks composite keys as tuples, not as individually unique columns', () => {
  const design = structuredClone(dataModel);
  design.tables[1].columns[1].primaryKey = true;
  const seed = structuredClone(seedData);
  const [first, second] = seed.tables[1].rows;
  second.id = first.id;
  expect(validateSeedData(seed, design)).toEqual([]);
  second.owner_id = first.owner_id;
  expect(validateSeedData(seed, design)).toContain(
    'pets: duplicate seed key (id, owner_id).',
  );
});

it('allows multiple nulls in a nullable unique FK, but rejects a repeated parent key value', () => {
  const design = structuredClone(dataModel);
  Object.assign(design.tables[1].columns[1], { nullable: true, unique: true });
  const seed = structuredClone(seedData);
  seed.tables[1].rows.forEach((row) => {
    row.owner_id = null;
  });
  expect(validateSeedData(seed, design)).toEqual([]);
  seed.tables[1].rows.forEach((row) => {
    row.owner_id = 1;
  });
  expect(validateSeedData(seed, design)).toContain(
    'pets: duplicate seed key (owner_id).',
  );
});
