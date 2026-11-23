import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredRequest } from '../../workflows/ports';
import { messageText, parseJsonObject, unwrapEnvelope } from './answer';
import { toChatMessages } from './messages';
import { isRateLimitError, RATE_LIMIT_FAILURE } from './rateLimit';
import type { AttemptObserver, ChatTransport, JsonOutcome } from './types';

async function validateAnswer<T>(
  text: string,
  { schema, verify }: StructuredRequest<T>,
): Promise<JsonOutcome<T>> {
  const candidate = parseJsonObject(text);
  if (!candidate)
    return { kind: 'schema', error: 'the answer was not a JSON object' };
  const parsed = schema.safeParse(
    unwrapEnvelope(candidate, Object.keys(schema.shape)),
  );
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { kind: 'schema', error };
  }
  const violations = await verify(parsed.data);
  if (violations.length)
    return {
      kind: 'verification',
      value: parsed.data,
      error: violations.join('; '),
    };
  return { kind: 'accepted', data: parsed.data };
}

/** Returns the checked answer, giving a rejected answer one corrective turn. */
export async function requestJson<T>(
  request: StructuredRequest<T> & {
    model: ChatTransport;
    onAttempt?: AttemptObserver;
  },
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
      request.onAttempt?.(request.stage, {
        kind: 'transport',
        error: rejection,
      });
      break;
    }

    const answer = await validateAnswer(text, request);
    if (answer.kind === 'accepted') {
      request.onAttempt?.(request.stage, { kind: 'accepted' });
      return answer.data;
    }
    request.onAttempt?.(request.stage, answer);
    rejection = answer.error;
    if (
      attempt === 2 ||
      (answer.kind === 'verification' && request.retryViolations === false)
    )
      break;

    messages.push(
      new AIMessage(text),
      new HumanMessage(JSON.stringify({ validationFeedback: rejection })),
    );
  }

  throw new Error(
    `The model did not return a usable ${request.stage}: ${rejection}`,
  );
}
