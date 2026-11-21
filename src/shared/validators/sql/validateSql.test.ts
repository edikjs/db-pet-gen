import { dataModel, ddl, seedData, seedSql } from '../../../test-support';
import { validateDdl, validateSeedSql } from './validateSql';

describe('SQL validation', () => {
  it('accepts parsed CREATE and INSERT statements', () => {
    expect(validateDdl(ddl, dataModel)).toEqual([]);
    expect(validateSeedSql(seedSql, seedData)).toEqual([]);
  });

  it('rejects other statement kinds', () => {
    expect(validateDdl('DROP TABLE owners;', dataModel)).toEqual([
      'DDL may contain only create table or create index.',
    ]);
    expect(
      validateSeedSql("UPDATE owners SET name = 'Eve';", seedData),
    ).toEqual(['seed SQL may contain only insert.']);
  });

  it('rejects unparsable SQL', () => {
    expect(validateDdl('this is not sql', dataModel).join(' ')).toContain(
      'Invalid DDL',
    );
    expect(validateSeedSql('this is not sql', seedData).join(' ')).toContain(
      'Invalid seed SQL',
    );
  });

  it('rejects parseable SQL that disagrees with the structured data', () => {
    expect(validateDdl(ddl.replace('integer', 'text'), dataModel)).not.toEqual(
      [],
    );
    expect(
      validateSeedSql(seedSql.replace('Milo', 'Sam'), seedData),
    ).not.toEqual([]);
  });
});
