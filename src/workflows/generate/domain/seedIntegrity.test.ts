import { dataModel, seedData } from '../../../adapters/testing';
import type {
  DataColumn,
  DataModel,
  SeedData,
  SeedValue,
} from './database.schema';
import { validateSeedData } from './seedIntegrity';

function valueColumn(
  type: DataColumn['type'],
  length: number | null = null,
): DataColumn {
  return {
    name: 'value',
    type,
    primaryKey: false,
    nullable: true,
    unique: false,
    length,
    defaultValue: null,
    references: null,
    comment: '',
  };
}

function singleValueTable(column: DataColumn, values: SeedValue[]) {
  const id: DataColumn = {
    ...valueColumn('INTEGER'),
    name: 'id',
    primaryKey: true,
    nullable: false,
  };
  const design: DataModel = {
    tables: [
      {
        name: 'items',
        comment: '',
        columns: [id, column],
        checks: [],
        indexes: [],
      },
    ],
  };
  const seed: SeedData = {
    tables: [
      {
        table: 'items',
        rows: values.map((value, i) => ({ id: i + 1, value })),
      },
    ],
  };
  return { design, seed };
}

it.each<[string, DataColumn, SeedValue]>([
  ['VARCHAR longer than declared length', valueColumn('VARCHAR', 3), 'four'],
  ['SMALLINT above range', valueColumn('SMALLINT'), 2 ** 15],
  ['SMALLINT below range', valueColumn('SMALLINT'), -(2 ** 15) - 1],
  ['INTEGER above range', valueColumn('INTEGER'), 2 ** 31],
  ['INTEGER below range', valueColumn('INTEGER'), -(2 ** 31) - 1],
  [
    'BIGINT beyond safe JSON integers',
    valueColumn('BIGINT'),
    Number.MAX_SAFE_INTEGER + 2,
  ],
  ['impossible DATE', valueColumn('DATE'), '2024-02-30'],
  [
    'TIMESTAMP without UTC marker',
    valueColumn('TIMESTAMP'),
    '2024-01-31T12:30:00',
  ],
])('rejects %s', (_label, column, value) => {
  const { design, seed } = singleValueTable(column, [value, value]);
  expect(validateSeedData(seed, design)).not.toEqual([]);
});

it('accepts boundary values and canonical date/time formats', () => {
  const boundaries: [DataColumn, SeedValue][] = [
    [valueColumn('VARCHAR', 3), 'abc'],
    [valueColumn('SMALLINT'), -(2 ** 15)],
    [valueColumn('SMALLINT'), 2 ** 15 - 1],
    [valueColumn('INTEGER'), -(2 ** 31)],
    [valueColumn('INTEGER'), 2 ** 31 - 1],
    [valueColumn('BIGINT'), Number.MAX_SAFE_INTEGER],
    [valueColumn('DATE'), '2024-02-29'],
    [valueColumn('TIMESTAMP'), '2024-01-31T12:30:00Z'],
  ];
  for (const [column, value] of boundaries) {
    const { design, seed } = singleValueTable(column, [value, value]);
    expect(validateSeedData(seed, design)).toEqual([]);
  }
});

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
