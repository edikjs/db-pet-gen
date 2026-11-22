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

  it('rejects numeric precision and scale that the design does not declare', () => {
    const model = structuredClone(dataModel);
    model.tables[0].columns[1].type = 'NUMERIC';
    const plain = ddl.replace('"name" text', '"name" numeric');
    expect(validateDdl(plain, model)).toEqual([]);
    expect(
      validateDdl(
        plain.replace('"name" numeric', '"name" numeric(10,2)'),
        model,
      ),
    ).not.toEqual([]);
  });

  it('rejects a varchar length that differs from the declared length', () => {
    const model = structuredClone(dataModel);
    Object.assign(model.tables[0].columns[1], {
      type: 'VARCHAR',
      length: 3,
    });
    const sql = ddl.replace('"name" text', '"name" varchar(3)');
    expect(validateDdl(sql, model)).toEqual([]);
    expect(
      validateDdl(sql.replace('varchar(3)', 'varchar(50)'), model),
    ).not.toEqual([]);
  });
});
