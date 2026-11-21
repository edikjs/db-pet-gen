import { loadConfig } from './env';
import type { ChatProvider } from './types';

const validEnv = {
  LLM_PROVIDER: 'openrouter',
  LLM_MODEL: 'example/model',
  LLM_API_KEY: 'test-key',
};

describe('loadConfig', () => {
  it('rejects credentials embedded in an endpoint instead of the key setting', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        LLM_BASE_URL: 'https://example.com/v1?api_key=secret',
      }),
    ).toThrow(/URLs must not contain credentials/u);
  });

  it('uses option defaults without reading process.env when an env is passed', () => {
    expect(loadConfig(validEnv)).toEqual({
      chat: {
        provider: 'openrouter',
        model: 'example/model',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        temperature: 0,
        jsonMode: true,
        maxTokens: 8192,
        maxRetries: 6,
      },
      runsDir: 'artifacts/runs',
      observability: {
        provider: 'none',
        endpoint: 'http://localhost:6006',
        projectName: 'db-pet-gen',
      },
    });
  });

  it('requires a provider and model in the environment', () => {
    expect(() => loadConfig({ LLM_MODEL: 'example/model' })).toThrow(
      /LLM_PROVIDER/u,
    );
    expect(() => loadConfig({ LLM_PROVIDER: 'openrouter' })).toThrow(
      /LLM_MODEL/u,
    );
  });

  it('selects the provider, model and endpoint from the environment', () => {
    const config = loadConfig({
      LLM_PROVIDER: 'groq',
      LLM_MODEL: 'new-model',
      LLM_BASE_URL: 'https://proxy.example/api/v1///',
      LLM_API_KEY: 'hosted-key',
    });
    expect(config.chat).toMatchObject({
      provider: 'groq',
      model: 'new-model',
      baseUrl: 'https://proxy.example/api/v1',
      apiKey: 'hosted-key',
      maxConcurrency: 1,
    });
  });

  it.each([
    ['openrouter', 'https://openrouter.ai/api/v1'],
    ['opencode', 'https://opencode.ai/zen/v1'],
    ['groq', 'https://api.groq.com/openai/v1'],
  ] as const)('sets the %s default URL', (provider, baseUrl) => {
    const config = loadConfig({
      ...validEnv,
      LLM_PROVIDER: provider,
    });
    expect(config.chat.baseUrl).toBe(baseUrl);
  });

  it.each(['openrouter', 'opencode', 'groq'] as ChatProvider[])(
    'requires a nonblank API key for %s',
    (provider) => {
      expect(() =>
        loadConfig({ LLM_PROVIDER: provider, LLM_MODEL: 'example/model' }),
      ).toThrow(/LLM_API_KEY/);
      expect(() =>
        loadConfig({
          LLM_PROVIDER: provider,
          LLM_MODEL: 'example/model',
          LLM_API_KEY: '   ',
        }),
      ).toThrow(/LLM_API_KEY/);
    },
  );

  it('resolves numeric and JSON options for a configured provider', () => {
    const config = loadConfig({
      ...validEnv,
      LLM_TEMPERATURE: '0.5',
      LLM_JSON_MODE: 'off',
      LLM_MAX_TOKENS: '16384',
      LLM_MAX_RETRIES: '0',
      LLM_MAX_CONCURRENCY: '3',
    });
    expect(config.chat).toMatchObject({
      apiKey: 'test-key',
      temperature: 0.5,
      jsonMode: false,
      maxTokens: 16384,
      maxRetries: 0,
      maxConcurrency: 3,
    });
  });

  it('resolves run and Phoenix settings independently of model settings', () => {
    const config = loadConfig({
      ...validEnv,
      RUNS_DIR: 'custom/runs',
      OBSERVABILITY_PROVIDER: 'phoenix',
      PHOENIX_COLLECTOR_ENDPOINT: 'https://collector.example/trace',
      PHOENIX_PROJECT_NAME: 'pet-generator',
    });
    expect(config.runsDir).toBe('custom/runs');
    expect(config.observability).toEqual({
      provider: 'phoenix',
      endpoint: 'https://collector.example/trace',
      projectName: 'pet-generator',
    });
  });

  it.each([
    ['LLM_PROVIDER', 'other'],
    ['LLM_MODEL', ' '],
    ['LLM_BASE_URL', 'ftp://example.com'],
    ['LLM_BASE_URL', 'http://example.com'],
    ['LLM_TEMPERATURE', '2.1'],
    ['LLM_JSON_MODE', 'invalid'],
    ['LLM_MAX_TOKENS', '0'],
    ['LLM_MAX_RETRIES', '-1'],
    ['LLM_MAX_CONCURRENCY', '0'],
    ['RUNS_DIR', ''],
    ['OBSERVABILITY_PROVIDER', 'other'],
    ['PHOENIX_COLLECTOR_ENDPOINT', 'not-a-url'],
    ['PHOENIX_PROJECT_NAME', ' '],
  ])('rejects invalid %s without exposing credentials', (key, value) => {
    try {
      loadConfig({ ...validEnv, [key]: value, LLM_API_KEY: 'private-key' });
      throw new Error('expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(key);
      expect((error as Error).message).not.toContain('private-key');
    }
  });

  it('reports multiple invalid environment settings together', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        LLM_MODEL: '',
        LLM_BASE_URL: 'invalid',
      }),
    ).toThrow(/LLM_MODEL.*LLM_BASE_URL/);
  });
});
