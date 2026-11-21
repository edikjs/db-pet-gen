import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { DEFAULT_LLM_MAX_RETRIES } from '../config';
import type { ChatModelConfig } from '../config';
import { isObject } from 'es-toolkit/compat';
import { errorMessage, reportDiagnostic } from '../shared';

/**
 * The chat model the stages use, built from the shared LLM config.
 *
 * The provider is an OpenAI-compatible endpoint in this project, so the same
 * client speaks to OpenRouter, OpenCode Zen and Groq. The stages only need
 * `invoke`, which keeps the injected test fake independent of the client.
 *
 * Providers are asked for a JSON object with `response_format`. This is
 * advisory: the schema always travels in the prompt and is enforced with zod
 * afterwards, because some models silently ignore provider-level JSON mode.
 *
 * The client owns the retries of a refused call (a 429): waits grow
 * exponentially with jitter instead of repeating the provider's fixed "try
 * again in N seconds" hint. `maxConcurrency` keeps side-by-side stage calls
 * inside a per-minute token budget. Every refused call is printed to stderr
 * as it happens.
 */

/**
 * Logs a refused call and makes its retries back off exponentially.
 *
 * p-retry waits `max(backoff, error.retryAfterMs)`. LangChain's default handler
 * copies a 429's "Please try again in 28.155s." into `retryAfterMs`, so every
 * retry would wait that same fixed time. Clearing the hint leaves the client's
 * own backoff — 1s baseline, ×2 per retry, with jitter — to grow the waits.
 * The default handler runs first: a 401 or an exhausted quota still stops
 * immediately instead of being retried.
 */
function withRetryBackoff(
  model: BaseChatModel,
  apiKey?: string,
): BaseChatModel {
  // AsyncCaller keeps the handler protected, but replacing it on the instance
  // is the only way to keep its retryability decision and change the delay.
  const caller = model.caller as unknown as {
    onFailedAttempt?: (error: unknown) => unknown;
  };
  const defaultHandler = caller.onFailedAttempt;
  caller.onFailedAttempt = (error: unknown) => {
    reportDiagnostic('Model call failed', errorMessage(error), apiKey);
    const outcome = defaultHandler?.(error);
    if (isObject(error)) {
      delete (error as { retryAfterMs?: number }).retryAfterMs;
    }
    return outcome;
  };
  return model;
}

/** The chat model of the generation stages, built from the shared config. */
export function createChatModel(config: ChatModelConfig): BaseChatModel {
  return withRetryBackoff(
    new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxRetries: config.maxRetries ?? DEFAULT_LLM_MAX_RETRIES,
      ...(config.maxConcurrency === undefined
        ? {}
        : { maxConcurrency: config.maxConcurrency }),
      ...(config.maxTokens === undefined
        ? {}
        : { maxTokens: config.maxTokens }),
      ...(config.jsonMode
        ? { modelKwargs: { response_format: { type: 'json_object' } } }
        : {}),
      configuration: { baseURL: config.baseUrl },
    }),
    config.apiKey,
  );
}
