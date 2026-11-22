import { parse } from 'pgsql-ast-parser';
import { dataModel, seedData } from '../../test-support';
import { renderDiagram, renderSeedSql } from './renderAssets';

it('preserves identifiers that are keywords in Mermaid', async () => {
  const model = structuredClone(dataModel);
  const [parent, child] = model.tables;
  parent.name = 'style';
  const fk = child.columns[1];
  fk.name = 'fk';
  child.indexes[0].columns = [fk.name];
  fk.references = { table: parent.name, column: 'id' };
  fk.nullable = true;
  const source = await renderDiagram(model);
  expect(source).toContain('INTEGER `fk` FK');
  expect(source).toContain('"style" |o--o{ "pets" : "fk"');
});

it('round-trips PostgreSQL literals in design column order', () => {
  const design = structuredClone(dataModel);
  design.tables[0].columns[1].nullable = true;
  design.tables[0].columns.push({
    ...design.tables[0].columns[1],
    name: 'active',
    type: 'BOOLEAN',
  });
  const name = String.raw`O'Brien\path\to`;
  const seed = structuredClone(seedData);
  seed.tables[0].rows = [
    { active: false, name, id: 1 },
    { id: 2, active: true, name: null },
  ];
  expect(parse(renderSeedSql(design, seed))).toMatchObject([
    {
      type: 'insert',
      into: { name: 'owners' },
      columns: [{ name: 'id' }, { name: 'name' }, { name: 'active' }],
      insert: {
        values: [
          [{ value: 1 }, { type: 'string', value: name }, { value: false }],
          [{ value: 2 }, { type: 'null' }, { value: true }],
        ],
      },
    },
    { type: 'insert', into: { name: 'pets' } },
  ]);
});
