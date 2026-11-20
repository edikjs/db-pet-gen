import { ChatOpenAI } from '@langchain/openai';
import { DEFAULT_LLM_MAX_RETRIES, loadConfig } from '../config';
import { createChatModel } from './model';

/**
 * The retry policy the OpenAI-compatible client keeps on its caller. The
 * caller marks both fields protected; the test reads them to prove the
 * configuration reached the client that applies it.
 */
function callerOf(model: ChatOpenAI): {
  maxRetries?: number;
  maxConcurrency?: number;
  onFailedAttempt?: (error: unknown) => void;
} {
  return (
    model as unknown as {
      caller: {
        maxRetries?: number;
        maxConcurrency?: number;
        onFailedAttempt?: (error: unknown) => void;
      };
    }
  ).caller;
}

describe('createChatModel', () => {
  it('builds an OpenRouter model on the OpenAI-compatible client', () => {
    const model = createChatModel({
      provider: 'openrouter',
      model: 'example/model',
      temperature: 0,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-key',
      jsonMode: true,
      maxTokens: 8192,
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    if (!(model instanceof ChatOpenAI)) {
      throw new Error('expected a ChatOpenAI model');
    }
    expect(model.model).toBe('example/model');
    expect(model.maxTokens).toBe(8192);
    expect(model.modelKwargs).toEqual({
      response_format: { type: 'json_object' },
    });
    expect(model.clientConfig.baseURL).toBe('https://openrouter.ai/api/v1');
  });

  it('omits JSON mode when it is turned off', () => {
    const model = createChatModel(
      loadConfig({
        LLM_PROVIDER: 'groq',
        LLM_MODEL: 'example/model',
        LLM_API_KEY: 'test-key',
        LLM_JSON_MODE: 'off',
      }).chat,
    );

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model).not.toMatchObject({
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  });

  it('builds a Groq model with the configured retry limits', () => {
    const model = createChatModel({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'groq-key',
      jsonMode: true,
      maxTokens: 8192,
      maxRetries: 3,
      maxConcurrency: 1,
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    if (!(model instanceof ChatOpenAI)) {
      throw new Error('expected a ChatOpenAI model');
    }
    expect(callerOf(model)).toMatchObject({
      maxRetries: 3,
      maxConcurrency: 1,
    });
  });

  it('prints a refused call and drops the fixed wait so retries back off', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = createChatModel({
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        temperature: 0,
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'groq-key',
        jsonMode: true,
      });
      if (!(model instanceof ChatOpenAI)) {
        throw new Error('expected a ChatOpenAI model');
      }
      const refused = Object.assign(
        new Error('429 Rate limit reached. Please try again in 28.155s.'),
        { status: 429, retryAfterMs: 28155 },
      );
      callerOf(model).onFailedAttempt?.(refused);

      expect(spy).toHaveBeenCalledWith(
        '[db-pet-gen] Model call failed: 429 Rate limit reached. Please try again in 28.155s.',
      );
      // p-retry waits max(backoff, retryAfterMs); without the fixed hint its
      // own exponential backoff (1s, 2s, 4s …) decides each retry's delay.
      expect(refused).not.toHaveProperty('retryAfterMs');
    } finally {
      spy.mockRestore();
    }
  });

  it('prints a redacted failure when the provider text holds a key', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = createChatModel({
        provider: 'openrouter',
        model: 'example/model',
        temperature: 0,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-key',
        jsonMode: true,
      });
      if (!(model instanceof ChatOpenAI)) {
        throw new Error('expected a ChatOpenAI model');
      }

      expect(() =>
        callerOf(model).onFailedAttempt?.(
          Object.assign(new Error('429 for Bearer sk-secret12345'), {
            status: 429,
          }),
        ),
      ).toThrow();

      const line = spy.mock.calls[0]?.[0];
      expect(String(line)).toContain('[REDACTED]');
      expect(String(line)).not.toContain('sk-secret12345');
    } finally {
      spy.mockRestore();
    }
  });

  it('still stops immediately on an error LangChain marks unretryable', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = createChatModel({
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        temperature: 0,
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'groq-key',
        jsonMode: true,
      });
      if (!(model instanceof ChatOpenAI)) {
        throw new Error('expected a ChatOpenAI model');
      }

      expect(() =>
        callerOf(model).onFailedAttempt?.(
          Object.assign(new Error('401 Invalid API key'), { status: 401 }),
        ),
      ).toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('defaults the retry budget and leaves concurrency unbounded', () => {
    const model = createChatModel(
      loadConfig({
        LLM_PROVIDER: 'openrouter',
        LLM_MODEL: 'example/model',
        LLM_API_KEY: 'key',
      }).chat,
    );

    if (!(model instanceof ChatOpenAI)) {
      throw new Error('expected a ChatOpenAI model');
    }
    expect(callerOf(model).maxRetries).toBe(DEFAULT_LLM_MAX_RETRIES);
    expect(callerOf(model).maxConcurrency).toBe(Number.POSITIVE_INFINITY);
  });
});
