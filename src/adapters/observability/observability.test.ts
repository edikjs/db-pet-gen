import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain';
import { register } from '@arizeai/phoenix-otel';
import * as callbackManager from '@langchain/core/callbacks/manager';
import { initObservability, type ObservabilityConfig } from './observability';

const mockProviderShutdown = jest.fn(async () => undefined);
const mockDisable = jest.fn();
const mockUnpatch = jest.fn();
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
          disable: mockDisable,
          unpatch: mockUnpatch,
          manuallyInstrument: mockManuallyInstrument,
        }) as unknown as LangChainInstrumentation,
    );
  });

  it('does not activate tracing when disabled', async () => {
    await expect(
      initObservability({ ...config, provider: 'none' }),
    ).resolves.toBeUndefined();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockInstrumentation).not.toHaveBeenCalled();
  });

  it('passes the endpoint and project name to Phoenix and shuts down cleanly', async () => {
    const handle = await initObservability(config);

    expect(mockRegister).toHaveBeenCalledWith({
      url: config.endpoint,
      projectName: config.projectName,
      batch: true,
    });
    expect(mockInstrumentation).toHaveBeenCalledWith({
      tracerProvider: { shutdown: mockProviderShutdown },
    });
    expect(mockManuallyInstrument).toHaveBeenCalledWith(callbackManager);

    expect(handle).toBeDefined();
    await handle!.shutdown();
    await handle!.shutdown();
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockUnpatch).toHaveBeenCalledTimes(1);
    expect(mockUnpatch).toHaveBeenCalledWith(callbackManager);
    expect(mockProviderShutdown).toHaveBeenCalledTimes(1);
  });

  it('closes the provider if instrumentation fails during initialization', async () => {
    mockManuallyInstrument.mockImplementationOnce(() => {
      throw new Error('instrumentation failed');
    });

    await expect(initObservability(config)).rejects.toThrow(
      'instrumentation failed',
    );
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockUnpatch).toHaveBeenCalledTimes(1);
    expect(mockProviderShutdown).toHaveBeenCalledTimes(1);
  });
});
