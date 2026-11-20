import { isRateLimitError, rateLimitFailure } from './rateLimit';

/** The body Groq returns for a tokens-per-minute overrun. */
const GROQ_MESSAGE =
  '429 Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m46f6pazege9gncg73zcxzw1` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7975, Requested 3779. Please try again in 28.155s.';

describe('isRateLimitError', () => {
  it('recognises a 429 by its status', () => {
    expect(
      isRateLimitError(Object.assign(new Error('too busy'), { status: 429 })),
    ).toBe(true);
  });

  it('recognises a status nested in the response', () => {
    const error = Object.assign(new Error('too busy'), {
      response: { status: 429 },
    });

    expect(isRateLimitError(error)).toBe(true);
  });

  it('recognises the Groq tokens-per-minute body without a status', () => {
    expect(isRateLimitError(new Error(GROQ_MESSAGE))).toBe(true);
  });

  it('recognises an exhausted quota', () => {
    expect(
      isRateLimitError(new Error('insufficient_quota: the account is empty')),
    ).toBe(true);
  });

  it('leaves other model failures to the corrective retry', () => {
    expect(isRateLimitError(new Error('the model returned no content'))).toBe(
      false,
    );
    expect(isRateLimitError('connection reset')).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe('rateLimitFailure', () => {
  it('keeps the provider text and says what to change', () => {
    const failure = rateLimitFailure(new Error(GROQ_MESSAGE));

    expect(failure).toContain('429 Rate limit reached');
    expect(failure).toContain('Please try again in 28.155s.');
    expect(failure).toContain('LLM_MAX_CONCURRENCY');
    expect(failure).toContain('LLM_MAX_TOKENS');
  });

  it('redacts a key embedded in the provider text', () => {
    const failure = rateLimitFailure(
      new Error('429 rate limit for Bearer sk-secret12345'),
    );

    expect(failure).toContain('[REDACTED]');
    expect(failure).not.toContain('sk-secret12345');
  });
});
