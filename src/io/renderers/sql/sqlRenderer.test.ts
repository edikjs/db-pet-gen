import { dataModel, seedData } from '../../../test-support/fixture';
import { renderDdl, renderSeedScript } from './sqlRenderer';

describe('deterministic SQL rendering', () => {
  it('renders the checked schema, indexes and foreign keys', () => {
    const ddl = renderDdl(dataModel, 'Pet records');
    expect(ddl).toContain('CREATE TABLE owners');
    expect(ddl).toContain('CREATE TABLE pets');
    expect(ddl).toContain('REFERENCES owners (id)');
    expect(ddl).toContain('CREATE INDEX idx_pets_owner');
  });

  it('escapes sample values as SQL literals', () => {
    const changed = structuredClone(seedData);
    changed.tables[0].rows[0].name = "O'Brien";
    expect(renderSeedScript(changed, dataModel, 'Pet records')).toContain(
      "O''Brien",
    );
  });
});
