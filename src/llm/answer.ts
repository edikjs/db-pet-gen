import type { BaseMessage } from '@langchain/core/messages';
import { isPlainObject } from 'es-toolkit';

/**
 * The helpers that read an answer of the model.
 *
 * The generation stages ask for structured answers and check them with zod
 * afterwards, so they share one reader for the text of an answer and the JSON
 * object inside it. Provider-level JSON mode is advisory; some models ignore
 * it or wrap the answer in a JSON-Schema envelope.
 */

/** The text of an answer, whatever shape its content has. */
export function messageText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (isPlainObject(block) && 'text' in block) {
        const { text } = block;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

/** The JSON object of an answer, or null when it holds none. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Unwraps an answer the model wrapped in a JSON-Schema envelope: the envelope
 * carries the keys under `properties` while `$schema`/`type` sit at the top.
 *
 * Only used when no key of the answer sits at the top level, so a genuine
 * answer is never touched.
 */
export function unwrapEnvelope(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  if (keys.some((key) => key in value)) {
    return value;
  }
  const properties = value.properties;
  if (isPlainObject(properties) && keys.some((key) => key in properties)) {
    return properties;
  }
  return value;
}

/** The JSON value of an answer — an object or an array — or null. */
export function parseJsonValue(text: string): unknown {
  const start = [text.indexOf('{'), text.indexOf('[')]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (start === undefined) {
    return null;
  }
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
