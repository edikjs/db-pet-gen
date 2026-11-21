import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { z } from 'zod';
import { errorMessage, redact } from '../shared';
import { messageText, parseJsonObject, unwrapEnvelope } from './answer';
import { isRateLimitError, rateLimitFailure } from './rateLimit';
import type { JsonOutcome, JsonRequest } from './types';

/**
 * One JSON request to the model, with the retries every stage needs.
 *
 * The stages ask the model for a structured answer, validate it with zod and
 * then check it against the artifacts of the run. An unusable answer is sent
 * back with one corrective message that repeats the exact problem; when the
 * last answer is rejected too, the request reports the error and the caller
 * fails the run with its own domain message.
 *
 * The loop lives here so the stages share one implementation; what stays with
 * each stage is the domain: how the answer is read, what makes it usable and
 * how a rejection is explained.
 */

/** The first JSON object of the text, unwrapped from an envelope if needed. */
function readValue(text: string, keys: readonly string[] | undefined): unknown {
  const candidate = parseJsonObject(text);
  return candidate && keys ? unwrapEnvelope(candidate, keys) : candidate;
}

/**
 * Asks the model until the answer is usable or the attempts run out.
 *
 * A model call that throws is retried with a plain "return the JSON" message;
 * a schema or domain rejection is retried with the stage's corrective message.
 * A call the provider refused for lack of capacity (a rate limit or an
 * exhausted quota) is the exception: the model never saw the conversation, so
 * the request reports the limit to the caller instead of spending its attempts
 * on corrective messages. The request never throws for a bad answer — the
 * caller owns the failure.
 */
export async function requestJson<T>(
  request: JsonRequest<T>,
): Promise<JsonOutcome<T>> {
  const messages = [...request.messages];
  let error = request.emptyError ?? 'the model returned no valid JSON';

  for (let remaining = request.attempts; remaining > 0; remaining -= 1) {
    let text: string;
    let response: BaseMessage;
    try {
      response = await request.model.invoke(messages);
      text = messageText(response);
    } catch (modelError) {
      if (isRateLimitError(modelError)) {
        return { ok: false, error: rateLimitFailure(modelError) };
      }
      error = redact(errorMessage(modelError));
      messages.push(
        new HumanMessage(
          `Your previous request failed: ${error}. Return ONLY the JSON object.`,
        ),
      );
      continue;
    }

    const value = readValue(text, request.keys);
    const parsed = request.schema.safeParse(value);
    if (!parsed.success) {
      error =
        value === null && request.emptyError
          ? request.emptyError
          : zodIssues(parsed.error);
    } else {
      const violations = (await request.verify?.(parsed.data)) ?? [];
      if (violations.length === 0) {
        return { ok: true, data: parsed.data };
      }
      error = violations.join('; ');
    }

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
