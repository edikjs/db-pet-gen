import { dataModel, ddl } from '../../../adapters/testing';
import { validateDdl } from './validateSql';

describe('SQL validation', () => {
  it('accepts parsed CREATE statements', () => {
    expect(validateDdl(ddl, dataModel)).toEqual([]);
  });

  it('rejects other statement kinds', () => {
    expect(validateDdl('DROP TABLE owners;', dataModel)).toEqual([
      'DDL may contain only create table or create index.',
    ]);
  });

  it('rejects unparsable SQL', () => {
    expect(validateDdl('this is not sql', dataModel).join(' ')).toContain(
      'Invalid DDL',
    );
  });

  it('rejects parseable SQL that disagrees with the structured data', () => {
    expect(validateDdl(ddl.replace('integer', 'text'), dataModel)).not.toEqual(
      [],
    );
  });
});
