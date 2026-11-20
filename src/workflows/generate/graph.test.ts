import { smokeCheckSql } from './graph';
import { renderDdl, renderSeedScript } from '../../io/renderers';
import { dataModel, seedData } from '../../test-support/fixture';

describe('SQL smoke check', () => {
  it('executes generated schema and seed in memory and counts rows', async () => {
    const result = await smokeCheckSql(
      renderDdl(dataModel),
      renderSeedScript(seedData, dataModel),
      dataModel,
    );
    expect(result).toMatchObject({
      status: 'passed',
      rowCounts: { owners: 2, pets: 2 },
    });
  });

  it('reports SQL failures instead of claiming a pass', async () => {
    const result = await smokeCheckSql('CREATE TABL broken;', '', dataModel);
    expect(result.status).toBe('failed');
    expect(result.reason).toBeTruthy();
  });
});
