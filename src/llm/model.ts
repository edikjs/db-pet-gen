import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { z } from 'zod';
import type { ChatModelConfig } from '../config';

/** Small model surface that lets generation and tests use the same request path. */
export interface GenerationModel {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

export function createChatModel(config: ChatModelConfig): GenerationModel {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature: config.temperature,
    maxRetries: config.maxRetries ?? 6,
    ...(config.maxConcurrency === undefined
      ? {}
      : { maxConcurrency: config.maxConcurrency }),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    ...(config.jsonMode
      ? { modelKwargs: { response_format: { type: 'json_object' } } }
      : {}),
    configuration: { baseURL: config.baseUrl },
  });
}

interface JsonRequest<T> {
  model: GenerationModel;
  prompt: string;
  schema: z.ZodType<T>;
  verify?: (data: T) => string[] | Promise<string[]>;
  /** Total calls, including the first. Defaults to two (one corrective retry). */
  attempts?: number;
  /** Called when each call starts and again if that call produces an issue. */
  onAttempt?: (event: {
    attempt: number;
    issue?: string;
  }) => void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redact(value: string): string {
  return value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /(\b(?:api[_-]?key|token|authorization)\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:sk-|gsk_|or-)[a-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .slice(0, 500);
}

function providerError(error: unknown): Error {
  const record = isRecord(error) ? error : undefined;
  const status = record?.status ?? record?.statusCode;
  const statusText =
    typeof status === 'number' || typeof status === 'string'
      ? ` (HTTP ${String(status)})`
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === 'string'
        ? record.message
        : 'unknown provider error';
  const refused =
    status === 401 ||
    status === '401' ||
    status === 403 ||
    status === '403' ||
    status === 429 ||
    status === '429' ||
    /\b(?:rate.limit|quota|unauthorized|forbidden|refus(?:ed|al))\b/i.test(
      message,
    ) ||
    (typeof record?.code === 'string' &&
      /(?:rate_limit|insufficient_quota)/i.test(record.code));
  const description = refused
    ? `Model provider refused the request${statusText}`
    : `Model request failed${statusText}`;
  // Do not attach the raw error as a cause: printing it could expose a key.
  return new Error(`${description}: ${redact(message)}`);
}

function refusal(message: BaseMessage): string | undefined {
  const fromMetadata = message.additional_kwargs.refusal;
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata;
  }
  const responseRefusal = isRecord(message.response_metadata)
    ? message.response_metadata.refusal
    : undefined;
  if (typeof responseRefusal === 'string' && responseRefusal.trim()) {
    return responseRefusal;
  }
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (isRecord(block) && block.type === 'refusal') {
        return typeof block.refusal === 'string'
          ? block.refusal
          : typeof block.text === 'string'
            ? block.text
            : 'The model declined to answer';
      }
    }
  }
  return undefined;
}

function responseText(message: BaseMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map((block) =>
      typeof block === 'string'
        ? block
        : isRecord(block) && typeof block.text === 'string'
          ? block.text
          : '',
    )
    .join('\n');
}

/** Read balanced JSON, ignoring braces in strings and prose or Markdown fences. */
function jsonCandidates(text: string): unknown[] {
  const trimmed = text.trim();
  try {
    return [JSON.parse(trimmed) as unknown];
  } catch {
    // A fenced or prefaced response can still hold a complete JSON value.
  }

  const candidates: unknown[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{' && text[start] !== '[') {
      continue;
    }
    const closing: string[] = [];
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const char = text[end];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        closing.push('}');
      } else if (char === '[') {
        closing.push(']');
      } else if (char === '}' || char === ']') {
        if (closing.pop() !== char) {
          break;
        }
        if (closing.length === 0) {
          try {
            candidates.push(JSON.parse(text.slice(start, end + 1)) as unknown);
          } catch {
            // Look for a later complete value instead.
          }
          start = end;
          break;
        }
      }
    }
  }
  return candidates;
}

function unwrapCandidates(value: unknown): unknown[] {
  const results = [value];
  const queue = [value];
  for (let depth = 0; depth < 3 && queue.length > 0; depth += 1) {
    const layer = queue.splice(0);
    for (const item of layer) {
      if (!isRecord(item)) {
        continue;
      }
      for (const key of [
        'properties',
        'data',
        'result',
        'output',
        'response',
        'answer',
      ]) {
        const nested = item[key];
        const values =
          typeof nested === 'string'
            ? jsonCandidates(nested)
            : isRecord(nested) || Array.isArray(nested)
              ? [nested]
              : [];
        results.push(...values);
        queue.push(...values);
      }
    }
  }
  return results;
}

function schemaIssue(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Ask for JSON, validate the data (not just its syntax), and correct one bad
 * answer by default. Provider failures and refusals are reported immediately.
 */
export async function requestJson<T>({
  model,
  prompt,
  schema,
  verify,
  attempts = 2,
  onAttempt,
}: JsonRequest<T>): Promise<T> {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be a positive integer');
  }

  const messages: BaseMessage[] = [new HumanMessage(prompt)];
  let issue = 'No valid JSON was returned';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await onAttempt?.({ attempt });
    let response: BaseMessage;
    try {
      response = await model.invoke(messages);
    } catch (error) {
      const failure = providerError(error);
      await onAttempt?.({ attempt, issue: failure.message });
      throw failure;
    }

    const text = responseText(response);
    const declined = refusal(response);
    if (
      declined ||
      /^\s*(?:I (?:cannot|can't|must decline)|I'm (?:unable|sorry))\b/i.test(
        text,
      )
    ) {
      issue = `Model refused to provide JSON: ${redact(declined ?? text.trim())}`;
      await onAttempt?.({ attempt, issue });
      throw new Error(issue);
    }

    const candidates = jsonCandidates(text);
    issue = 'No valid JSON value found in model response';
    for (const candidate of candidates) {
      for (const value of unwrapCandidates(candidate)) {
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
          issue = schemaIssue(parsed.error);
          continue;
        }
        const problems = (await verify?.(parsed.data)) ?? [];
        if (problems.length === 0) {
          return parsed.data;
        }
        issue = problems.join('; ');
      }
    }
    await onAttempt?.({ attempt, issue });
    if (attempt < attempts) {
      messages.push(
        new AIMessage(text.slice(0, 4000)),
        new HumanMessage(
          `The previous answer was invalid: ${issue}. Correct it and return only JSON data matching the requested shape, without a schema envelope or explanation.`,
        ),
      );
    }
  }
  throw new Error(
    `Unable to obtain valid JSON after ${attempts} attempt(s): ${issue}`,
  );
}
