import type { AppConfig, ChatProvider } from './types';
import { EnvSchema } from './env.schema';

const BASE_URLS: Record<ChatProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  opencode: 'https://opencode.ai/zen/v1',
  groq: 'https://api.groq.com/openai/v1',
};

/** Validate the model and run settings from the environment. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const values = parsed.data;
  const provider = values.LLM_PROVIDER;
  const apiKey = values.LLM_API_KEY || undefined;
  if (!apiKey) {
    throw new Error(
      `Invalid environment configuration: LLM_API_KEY: required for LLM_PROVIDER=${provider}`,
    );
  }

  const maxConcurrency =
    values.LLM_MAX_CONCURRENCY ?? (provider === 'groq' ? 1 : undefined);

  return {
    chat: {
      provider,
      model: values.LLM_MODEL,
      baseUrl: (values.LLM_BASE_URL ?? BASE_URLS[provider]).replace(/\/+$/, ''),
      temperature: values.LLM_TEMPERATURE,
      jsonMode: values.LLM_JSON_MODE === 'on',
      ...(apiKey ? { apiKey } : {}),
      maxTokens: values.LLM_MAX_TOKENS,
      maxRetries: values.LLM_MAX_RETRIES,
      ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
    },
    runsDir: values.RUNS_DIR,
    observability: {
      provider: values.OBSERVABILITY_PROVIDER,
      endpoint: values.PHOENIX_COLLECTOR_ENDPOINT,
      projectName: values.PHOENIX_PROJECT_NAME,
    },
  };
}
