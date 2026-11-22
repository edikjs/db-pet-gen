import type { ChatModelConfig } from '../../config';
import { redact as redactText } from '../../shared';
import type { ModelPort } from '../../workflows/ports';
import { generationClient } from './model';
import { requestJson } from './structuredRequest';
import type { ChatTransport } from './types';

/** The OpenAI-compatible adapter behind the model port. */
export function createModelPort(
  config: ChatModelConfig,
  injected?: ChatTransport,
): ModelPort {
  const model = generationClient(config, injected);
  return {
    json: (request) => requestJson({ ...request, model }),
    identity: () => ({
      provider: config.provider,
      name: config.model,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
    }),
    redact: (text) => redactText(text, config.apiKey),
    containsSecret: (text) =>
      Boolean(config.apiKey && text.includes(config.apiKey)),
  };
}

export { createChatModel, generationClient } from './model';
export type { ChatTransport } from './types';
