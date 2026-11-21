import { ddl, seedSql } from '../../../test-support';
import { validateDdl, validateSeedSql } from './validateSql';

describe('SQL validation', () => {
  it('accepts parsed CREATE and INSERT statements', () => {
    expect(validateDdl(ddl)).toEqual([]);
    expect(validateSeedSql(seedSql)).toEqual([]);
  });

  it('rejects other statement kinds', () => {
    expect(validateDdl('DROP TABLE owners;')).toEqual([
      'DDL may contain only create table or create index.',
    ]);
    expect(validateSeedSql("UPDATE owners SET name = 'Eve';")).toEqual([
      'seed SQL may contain only insert.',
    ]);
  });

  it('rejects unparsable SQL', () => {
    expect(validateDdl('this is not sql').join(' ')).toContain('Invalid DDL');
    expect(validateSeedSql('this is not sql').join(' ')).toContain(
      'Invalid seed SQL',
    );
  });
});
