import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { messageText, parseJsonObject, unwrapEnvelope } from './answer';
import { isRateLimitError, RATE_LIMIT_FAILURE } from './rateLimit';
import type { JsonOutcome, JsonRequest } from './types';

async function validateAnswer<T>(
  text: string,
  request: JsonRequest<T>,
): Promise<JsonOutcome<T>> {
  const candidate = parseJsonObject(text);
  const value =
    candidate && request.keys
      ? unwrapEnvelope(candidate, request.keys)
      : candidate;
  const parsed = request.schema.safeParse(value);
  if (!parsed.success) {
    const error =
      value === null && request.emptyError
        ? request.emptyError
        : zodIssues(parsed.error);
    return { ok: false, error };
  }
  const violations = await request.verify?.(parsed.data);
  if (violations?.length) return { ok: false, error: violations.join('; ') };
  return { ok: true, data: parsed.data };
}

/**
 * Asks the model until the answer is usable or the attempts run out.
 *
 * The client owns transport retries. Only rejected answers get a corrective
 * turn; provider diagnostics must never become conversation content.
 */
export async function requestJson<T>(
  request: JsonRequest<T>,
): Promise<JsonOutcome<T>> {
  const messages = [...request.messages];
  let error = request.emptyError ?? 'the model returned no valid JSON';

  for (let remaining = request.attempts; remaining > 0; remaining -= 1) {
    let text: string;
    try {
      text = messageText(await request.model.invoke(messages));
    } catch (modelError) {
      if (isRateLimitError(modelError)) {
        return { ok: false, error: RATE_LIMIT_FAILURE };
      }
      return {
        ok: false,
        error:
          'The provider request failed; check the local client diagnostic.',
      };
    }

    const answer = await validateAnswer(text, request);
    if (answer.ok) return answer;
    error = answer.error;

    messages.push(
      new AIMessage(text),
      new HumanMessage(request.corrective(error)),
    );
  }

  return { ok: false, error };
}

/** The zod issues of an answer, one per line. */
function zodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
