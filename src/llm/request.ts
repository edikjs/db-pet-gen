import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { messageText, parseJsonObject, unwrapEnvelope } from './answer';
import { isRateLimitError, RATE_LIMIT_FAILURE } from './rateLimit';
import type { JsonOutcome, JsonRequest } from './types';

async function validateAnswer<T>(
  text: string,
  { schema, verify }: JsonRequest<T>,
): Promise<JsonOutcome<T>> {
  const candidate = parseJsonObject(text);
  if (!candidate)
    return { ok: false, error: 'the answer was not a JSON object' };
  const parsed = schema.safeParse(
    unwrapEnvelope(candidate, Object.keys(schema.shape)),
  );
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, error };
  }
  const violations = await verify(parsed.data);
  if (violations.length) return { ok: false, error: violations.join('; ') };
  return { ok: true, data: parsed.data };
}

/**
 * Returns the checked answer, giving a rejected answer one corrective turn.
 *
 * The client owns transport retries. Only rejected answers get a corrective
 * turn; provider diagnostics must never become conversation content.
 */
export async function requestJson<T>(request: JsonRequest<T>): Promise<T> {
  const messages = [...request.messages];
  let rejection: string;
  for (let attempt = 1; ; attempt++) {
    let text: string;
    try {
      text = messageText(await request.model.invoke(messages));
    } catch (modelError) {
      rejection = isRateLimitError(modelError)
        ? RATE_LIMIT_FAILURE
        : 'The provider request failed; check the local client diagnostic.';
      break;
    }

    const answer = await validateAnswer(text, request);
    if (answer.ok) return answer.data;
    rejection = answer.error;
    if (attempt === 2) break;

    messages.push(
      new AIMessage(text),
      new HumanMessage(JSON.stringify({ validationFeedback: rejection })),
    );
  }

  throw new Error(
    `The model did not return a usable ${request.stage}: ${rejection}`,
  );
}
