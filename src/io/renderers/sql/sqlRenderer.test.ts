import { dataModel, seedData } from '../../../test-support/fixture';
import { renderDdl, renderSeedScript } from './sqlRenderer';

describe('SQL rendering', () => {
  it('compiles the checked schema, indexes and foreign keys', () => {
    const ddl = renderDdl(dataModel);
    expect(ddl).toContain('create table "owners"');
    expect(ddl).toContain('create table "pets"');
    expect(ddl).toContain('references "owners" ("id")');
    expect(ddl).toContain('create index "idx_pets_owner"');
  });

  it('compiles sample values as SQL literals', () => {
    const changed = structuredClone(seedData);
    changed.tables[0].rows[0].name = "O'Brien";
    expect(renderSeedScript(changed, dataModel)).toContain("'O''Brien'");
  });

  it('quotes a default value instead of treating it as SQL text', () => {
    const changed = structuredClone(dataModel);
    changed.tables[0].columns[1].defaultValue = "O'Brien";
    expect(renderDdl(changed)).toContain("default 'O''Brien'");
  });
});
