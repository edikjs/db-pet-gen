import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain';
import { register } from '@arizeai/phoenix-otel';
import * as callbackManager from '@langchain/core/callbacks/manager';

export interface ObservabilityConfig {
  provider: 'none' | 'phoenix';
  endpoint: string;
  projectName: string;
}

export interface ObservabilityHandle {
  shutdown: () => Promise<void>;
}

/** Opt-in LangChain tracing with statically imported dependencies. */
export async function initObservability(
  config: ObservabilityConfig,
): Promise<ObservabilityHandle | undefined> {
  if (config.provider === 'none') {
    return undefined;
  }

  const provider = register({
    url: config.endpoint,
    projectName: config.projectName,
    batch: true,
  });
  const instrumentation = new LangChainInstrumentation({
    tracerProvider: provider,
  });

  const close = async (): Promise<void> => {
    try {
      instrumentation.disable();
    } finally {
      try {
        // In v4.2.2 disable() alone does not undo a manual patch on a preloaded module.
        instrumentation['unpatch'](callbackManager);
      } finally {
        await provider.shutdown();
      }
    }
  };

  try {
    // Instrument explicitly so this works even if LangChain was loaded earlier.
    instrumentation.manuallyInstrument(callbackManager);
  } catch (error) {
    await close();
    throw error;
  }

  let shutdownPromise: Promise<void> | undefined;
  return {
    shutdown: () => {
      shutdownPromise ??= close();
      return shutdownPromise;
    },
  };
}
