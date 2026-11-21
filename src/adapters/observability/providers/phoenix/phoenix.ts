import { register } from '@arizeai/phoenix-otel';
import type { ObservabilityConfig, PhoenixTracing } from '../../types';

export function initPhoenix(config: ObservabilityConfig): PhoenixTracing {
  const provider = register({
    projectName: config.projectName,
    url: config.endpoint,
    batch: true,
    global: false,
  });

  return { provider, shutdown: () => provider.shutdown() };
}
