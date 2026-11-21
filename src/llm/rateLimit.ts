import { isPlainObject } from 'es-toolkit';
import { isObject } from 'es-toolkit/compat';
import { errorMessage } from '../shared';

/**
 * How the stages recognise a provider that refused a call for now.
 *
 * The model clients retry a rate limit themselves with exponential backoff
 * (≈1s, 2s, 4s …), so most limits never reach a stage. What reaches a stage is
 * a call refused after those retries — asking the model again right away
 * cannot fix that, so the request loops stop and report the limit instead of
 * spending their corrective attempts on a conversation the model never saw.
 *
 * Groq's tokens-per-minute answer is the loudest case: a 429 whose body names
 * the limit and the wait. The status is the reliable signal; the text signals
 * catch a client or proxy that loses it.
 */
const RATE_LIMIT_SIGNALS = [
  'rate limit',
  'rate-limit',
  'rate_limit',
  'ratelimit',
  'too many requests',
  'insufficient quota',
  'insufficient_quota',
  'quota has been exhausted',
  'quota exhausted',
  'tokens per minute',
];

/** The HTTP status of a failed call, wherever the client attached it. */
function statusOf(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }
  const candidate = error as Record<string, unknown>;
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === 'number') {
    return status;
  }
  const response = candidate.response;
  if (isPlainObject(response) && typeof response.status === 'number') {
    return response.status;
  }
  return undefined;
}

/**
 * Whether a failed model call was refused by a rate limit (or an exhausted
 * quota). Both mean the same thing for a stage: the provider will not answer
 * now, and only time fixes it.
 */
export function isRateLimitError(error: unknown): boolean {
  if (statusOf(error) === 429) {
    return true;
  }
  const message = errorMessage(error).toLowerCase();
  return RATE_LIMIT_SIGNALS.some((signal) => message.includes(signal));
}

export const RATE_LIMIT_FAILURE =
  'The provider rate-limited the model (or the account is out of quota); retry the run once the limit resets, and lower LLM_MAX_CONCURRENCY or LLM_MAX_TOKENS if it keeps happening.';
