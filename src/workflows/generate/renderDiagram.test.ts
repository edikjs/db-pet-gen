import { dataModel } from '../../test-support';
import { renderDiagram } from './renderDiagram';

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
