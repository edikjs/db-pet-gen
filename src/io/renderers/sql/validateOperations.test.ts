import { dataModel, operations } from '../../../test-support/fixture';
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

  it('rejects parameters that are not columns of the declared tables', () => {
    const bad = structuredClone(operations);
    bad.operations[0].parameters = ['missing'];
    expect(() => validateOperations(bad, dataModel)).toThrow(
      /not columns of its tables/u,
    );
  });
});
