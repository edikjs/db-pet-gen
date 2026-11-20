import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain';
import { register } from '@arizeai/phoenix-otel';
import * as callbackManager from '@langchain/core/callbacks/manager';
import { initObservability } from './observability';
import type { ObservabilityConfig } from './types';

const mockProviderShutdown = jest.fn(async () => undefined);
const mockManuallyInstrument = jest.fn();
jest.mock('@arizeai/phoenix-otel', () => ({ register: jest.fn() }));
jest.mock('@arizeai/openinference-instrumentation-langchain', () => ({
  LangChainInstrumentation: jest.fn(),
}));
jest.mock('@langchain/core/callbacks/manager', () => ({
  CallbackManager: {},
}));

const mockRegister = jest.mocked(register);
const mockInstrumentation = jest.mocked(LangChainInstrumentation);

describe('initObservability', () => {
  const config: ObservabilityConfig = {
    provider: 'phoenix',
    endpoint: 'http://localhost:6006',
    projectName: 'test-project',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegister.mockReturnValue({
      shutdown: mockProviderShutdown,
    } as unknown as ReturnType<typeof register>);
    mockInstrumentation.mockImplementation(
      () =>
        ({
          manuallyInstrument: mockManuallyInstrument,
        }) as unknown as LangChainInstrumentation,
    );
  });

  it('does not activate tracing when disabled', () => {
    expect(initObservability({ ...config, provider: 'none' })).toBeUndefined();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockInstrumentation).not.toHaveBeenCalled();
  });

  it('passes the endpoint and project name to Phoenix and shuts down cleanly', async () => {
    const handle = initObservability(config);

    expect(mockRegister).toHaveBeenCalledWith({
      url: config.endpoint,
      projectName: config.projectName,
      batch: true,
    });
    expect(mockInstrumentation).toHaveBeenCalledWith({
      tracerProvider: { shutdown: mockProviderShutdown },
    });
    expect(mockManuallyInstrument).toHaveBeenCalledWith(callbackManager);

    await handle!.shutdown();
    expect(mockProviderShutdown).toHaveBeenCalledTimes(1);
  });
});
