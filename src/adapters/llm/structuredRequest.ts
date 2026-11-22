import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredRequest } from '../../workflows/ports';
import { messageText, parseJsonObject, unwrapEnvelope } from './answer';
import { toChatMessages } from './messages';
import { isRateLimitError, RATE_LIMIT_FAILURE } from './rateLimit';
import type { ChatTransport } from './types';

type JsonOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

async function validateAnswer<T>(
  text: string,
  { schema, verify }: StructuredRequest<T>,
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

/** Returns the checked answer, giving a rejected answer one corrective turn. */
export async function requestJson<T>(
  request: StructuredRequest<T> & { model: ChatTransport },
): Promise<T> {
  const messages: BaseMessage[] = toChatMessages(request.messages);
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
