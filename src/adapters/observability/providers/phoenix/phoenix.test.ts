import type { ObservabilityConfig } from '../../types';
import { initPhoenix } from './phoenix';

const config: ObservabilityConfig = {
  provider: 'phoenix',
  endpoint: 'http://localhost:6006',
  projectName: 'test-project',
};

describe('initPhoenix', () => {
  it('registers a tracer provider and exposes a shutdown hook', async () => {
    const tracing = initPhoenix(config);

    expect(tracing.provider).toBeDefined();
    await expect(tracing.shutdown()).resolves.toBeUndefined();
  });
});
