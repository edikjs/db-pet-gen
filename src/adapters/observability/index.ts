import type { TracePort } from '../../workflows/ports';
import { observeStages } from './observability';
import { createPhoenixProvider } from './providers/phoenix';
import type { ObservabilityProvider, ObservabilitySettings } from './types';

export type {
  ObservabilityProvider,
  ObservabilityHandle,
  ObservabilitySettings,
} from './types';

const providers = { none: () => undefined, phoenix: createPhoenixProvider };

/** The tracing adapter behind the trace port. */
export function createTraceAdapter(
  settings: ObservabilitySettings,
  createProvider?: () => ObservabilityProvider | undefined,
): TracePort {
  const provider = createProvider
    ? createProvider()
    : providers[settings.provider](settings);
  if (!provider)
    return { stageEvent: () => undefined, shutdown: async () => undefined };
  const handle = observeStages(provider);
  return { stageEvent: handle.stageEvent, shutdown: handle.shutdown };
}
