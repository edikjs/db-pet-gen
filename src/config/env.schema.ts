import { z } from 'zod';
import type { ChatProvider } from './types';

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

export const EnvSchema = z.object({
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
