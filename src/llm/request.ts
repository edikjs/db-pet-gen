import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { z } from 'zod';
import { errorMessage, redact } from '../utils/errors';
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
  const prepare = request.prepare ?? defaultPrepare(request.keys);
  let error = 'the model returned no valid JSON';
  let best: T | null = null;
  let bestEffort = false;

  for (let attempt = 0; attempt < request.attempts; attempt += 1) {
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

    const value = prepare(text, response);
    const parsed = request.schema.safeParse(value);
    if (!parsed.success) {
      error =
        value === null && request.emptyError
          ? resolveEmptyError(request.emptyError, text)
          : zodIssues(parsed.error);
    } else {
      const violations =
        request.verify?.(parsed.data, {
          attempt,
          attempts: request.attempts,
          last: attempt === request.attempts - 1,
        }) ?? [];
      if (violations.length === 0) {
        const soft = request.soft?.(parsed.data) ?? [];
        if (soft.length === 0) {
          return { ok: true, data: parsed.data, bestEffort: false };
        }
        best = parsed.data;
        bestEffort = true;
        error = soft.join('; ');
      } else {
        error = violations.join('; ');
      }
    }

    messages.push(
      new AIMessage(text),
      new HumanMessage(request.corrective(error)),
    );
  }

  if (best !== null) {
    return { ok: true, data: best, bestEffort };
  }
  return { ok: false, error };
}

/** The default reader: the first JSON object of the text, unwrapped. */
function defaultPrepare(
  keys: readonly string[] | undefined,
): (text: string) => unknown {
  return (text) => {
    const candidate = parseJsonObject(text);
    if (!candidate) {
      return null;
    }
    return keys ? unwrapEnvelope(candidate, keys) : candidate;
  };
}

/** The error reported for an answer that held no JSON. */
function resolveEmptyError(
  emptyError: string | ((text: string) => string),
  text: string,
): string {
  return typeof emptyError === 'function' ? emptyError(text) : emptyError;
}

/** The zod issues of an answer, one per line. */
function zodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
