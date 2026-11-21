import type { ObservabilityConfig } from './types';
import { initObservability } from './observability';

const config: ObservabilityConfig = {
  provider: 'phoenix',
  endpoint: 'http://localhost:6006',
  projectName: 'test-project',
};

describe('Phoenix tracing', () => {
  it('registers a tracer provider and exposes a shutdown hook', async () => {
    const tracing = initObservability(config)!;

    await expect(tracing.shutdown()).resolves.toBeUndefined();
  });
});
