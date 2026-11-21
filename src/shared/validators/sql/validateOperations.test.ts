import { dataModel, operations } from '../../../test-support';
import { validateOperations } from './validateOperations';

describe('operation validation', () => {
  const issues = (bad: typeof operations): string =>
    validateOperations(bad, dataModel).join(' ');

  it('accepts checked SELECT and DELETE statements', () => {
    expect(validateOperations(operations, dataModel)).toEqual([]);
  });

  it('rejects statements that are not one of the allowed kinds', () => {
    const bad = structuredClone(operations);
    bad.operations[0].statement = 'DROP TABLE pets';
    expect(issues(bad)).toMatch(/parsed SELECT/u);

    bad.operations[0].statement = 'this is not sql';
    expect(issues(bad)).toMatch(/parsed SELECT/u);
  });

  it('rejects a second statement hidden after an allowed one', () => {
    const bad = structuredClone(operations);
    bad.operations[0].statement =
      'SELECT id FROM pets WHERE id = :owner_id; DROP TABLE owners';
    expect(issues(bad)).toMatch(/parsed SELECT/u);
  });

  it('requires one statement even when both are SELECTs on declared tables', () => {
    const bad = structuredClone(operations);
    bad.operations[0].statement += '; SELECT * FROM pets';
    expect(issues(bad)).toContain('exactly one');
  });

  it('rejects tables that are not in the checked design', () => {
    const bad = structuredClone(operations);
    bad.operations[0].tables = ['ghosts'];
    expect(issues(bad)).toMatch(/absent from the design/u);
  });

  it('rejects declared tables the statement never mentions', () => {
    const bad = structuredClone(operations);
    bad.operations[0].tables = ['pets', 'owners'];
    expect(issues(bad)).toMatch(/does not mention all declared tables/u);
  });

  it('rejects design tables the statement mentions but does not declare', () => {
    const bad = structuredClone(operations);
    bad.operations[0].statement =
      'SELECT pets.id FROM pets JOIN owners ON owners.id = pets.owner_id WHERE pets.owner_id = :owner_id';
    expect(issues(bad)).toMatch(/does not declare/u);
  });

  it('allows parameters that are values rather than columns', () => {
    const withThreshold = structuredClone(operations);
    withThreshold.operations[0].statement =
      'SELECT id FROM pets WHERE id > :threshold';
    withThreshold.operations[0].parameters = ['threshold'];
    expect(validateOperations(withThreshold, dataModel)).toEqual([]);
  });

  it('allows a CTE name that is not a design table', () => {
    const withCte = structuredClone(operations);
    withCte.operations[0].statement =
      'WITH selected AS (SELECT id FROM pets WHERE owner_id = :owner_id) SELECT id FROM selected';
    expect(validateOperations(withCte, dataModel)).toEqual([]);
  });

  it.each([
    'SELECT p.id FROM pets p JOIN ghosts g ON g.id = p.id',
    'SELECT * FROM (WITH ghosts AS (SELECT * FROM pets) SELECT * FROM ghosts) AS q JOIN ghosts ON true',
  ])('rejects an unknown physical table in %s', (statement) => {
    const op = { ...operations.operations[0], statement, parameters: [] };
    expect(issues({ operations: [op] })).toContain(
      'absent from the design: ghosts',
    );
  });

  it.each([
    'WITH a AS (SELECT * FROM pets), b AS (SELECT * FROM a) SELECT * FROM b',
    'WITH RECURSIVE n AS (SELECT id FROM pets UNION ALL SELECT id FROM n) SELECT * FROM n',
  ])(
    'allows scoped CTEs while counting only physical design tables in %s',
    (statement) => {
      const op = { ...operations.operations[0], statement, parameters: [] };
      expect(issues({ operations: [op] })).toBe('');
    },
  );

  it('rejects parameters that are not used or are not declared', () => {
    const unused = structuredClone(operations);
    unused.operations[0].parameters = ['missing'];
    expect(issues(unused)).toMatch(/not used in the statement/u);

    const undeclared = structuredClone(operations);
    undeclared.operations[0].parameters = [];
    expect(issues(undeclared)).toMatch(
      /uses parameters that are not declared/u,
    );
  });
});
