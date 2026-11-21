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
