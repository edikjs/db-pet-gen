import type { AppConfig } from '../../config';
import { observeStages } from './observability';
import { createPhoenixProvider } from './providers/phoenix';
import type { ObservabilityProvider } from './types';

export type { ObservabilityProvider } from './types';

const providers = { none: () => undefined, phoenix: createPhoenixProvider };

export function initObservability(
  config: AppConfig['observability'],
  createProvider?: () => ObservabilityProvider,
) {
  const provider = createProvider
    ? createProvider()
    : providers[config.provider](config);
  return provider && observeStages(provider);
}
