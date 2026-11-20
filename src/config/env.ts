import { z } from 'zod';
import type { AppConfig, ChatProvider } from './types';

/**
 * How often a refused model call is retried when `LLM_MAX_RETRIES` is unset.
 * The client's waits grow exponentially instead of repeating the provider's
 * fixed "try again in N seconds" hint.
 */
export const DEFAULT_LLM_MAX_RETRIES = 6;

const CHAT_PROVIDERS = [
  'openrouter',
  'opencode',
  'groq',
] as const satisfies readonly ChatProvider[];

const BASE_URLS: Record<ChatProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  opencode: 'https://opencode.ai/zen/v1',
  groq: 'https://api.groq.com/openai/v1',
};

const numberFromEnv = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().finite());

const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'Must be an HTTP(S) URL',
  )
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  }, 'Put credentials in LLM_API_KEY; URLs must not contain credentials, query parameters or fragments');

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(CHAT_PROVIDERS),
  LLM_MODEL: z.string().trim().min(1),
  LLM_BASE_URL: httpUrl.optional(),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_TEMPERATURE: numberFromEnv.pipe(z.number().min(0).max(2)).default(0),
  LLM_JSON_MODE: z.enum(['on', 'off']).default('on'),
  LLM_MAX_TOKENS: numberFromEnv.pipe(z.number().int().positive()).default(8192),
  LLM_MAX_RETRIES: numberFromEnv
    .pipe(z.number().int().nonnegative())
    .default(DEFAULT_LLM_MAX_RETRIES),
  LLM_MAX_CONCURRENCY: numberFromEnv
    .pipe(z.number().int().positive())
    .optional(),
  RUNS_DIR: z.string().trim().min(1).default('artifacts/runs'),
  OBSERVABILITY_PROVIDER: z.enum(['none', 'phoenix']).default('none'),
  PHOENIX_COLLECTOR_ENDPOINT: httpUrl.default('http://localhost:6006'),
  PHOENIX_PROJECT_NAME: z.string().trim().min(1).default('db-pet-gen'),
});

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
