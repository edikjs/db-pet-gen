import * as CallbackManagerModule from '@langchain/core/callbacks/manager';
import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain';
import { initPhoenix } from './providers';
import type { ObservabilityConfig, ObservabilityHandle } from './types';

export function initObservability(
  config: ObservabilityConfig,
): ObservabilityHandle | undefined {
  if (config.provider !== 'phoenix') {
    return undefined;
  }

  const tracing = initPhoenix(config);
  const instrumentation = new LangChainInstrumentation({
    tracerProvider: tracing.provider,
  });
  instrumentation.manuallyInstrument(CallbackManagerModule);

  return { shutdown: tracing.shutdown };
}
