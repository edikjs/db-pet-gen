import { dataModel, operations } from '../../../test-support';
import { validateOperations } from './validateOperations';

describe('operation validation', () => {
  it('accepts checked SELECT and DELETE statements', () => {
    expect(() => validateOperations(operations, dataModel)).not.toThrow();
  });

  it('rejects statements that are not one of the allowed kinds', () => {
    const bad = structuredClone(operations);
    bad.operations[0].statement = 'DROP TABLE pets';
    expect(() => validateOperations(bad, dataModel)).toThrow(/parsed SELECT/u);

    bad.operations[0].statement = 'this is not sql';
    expect(() => validateOperations(bad, dataModel)).toThrow(/parsed SELECT/u);
  });

  it('rejects tables that are not in the checked design', () => {
    const bad = structuredClone(operations);
    bad.operations[0].tables = ['ghosts'];
    expect(() => validateOperations(bad, dataModel)).toThrow(
      /absent from the design/u,
    );
  });

  it('rejects declared tables the statement never mentions', () => {
    const bad = structuredClone(operations);
    bad.operations[0].tables = ['pets', 'owners'];
    expect(() => validateOperations(bad, dataModel)).toThrow(
      /does not mention all declared tables/u,
    );
  });

  it('allows parameters that are values rather than columns', () => {
    const withThreshold = structuredClone(operations);
    withThreshold.operations[0].statement =
      'SELECT id FROM pets WHERE id > :threshold';
    withThreshold.operations[0].parameters = ['threshold'];
    expect(() => validateOperations(withThreshold, dataModel)).not.toThrow();
  });

  it('rejects parameters that are not used or are not declared', () => {
    const unused = structuredClone(operations);
    unused.operations[0].parameters = ['missing'];
    expect(() => validateOperations(unused, dataModel)).toThrow(
      /not used in the statement/u,
    );

    const undeclared = structuredClone(operations);
    undeclared.operations[0].parameters = [];
    expect(() => validateOperations(undeclared, dataModel)).toThrow(
      /uses parameters that are not declared/u,
    );
  });
});
