import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';

/** Minimal chat-model surface the generation stages need; tests inject a fake. */
export interface GenerationModel {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

/** One request: the model, the conversation and the checks of the answer. */
export interface JsonRequest<T> {
  /** The model that answers. */
  model: GenerationModel;
  /** The conversation so far; the request appends to a copy. */
  messages: BaseMessage[];
  /** The schema the answer is validated with. */
  schema: z.ZodType<T>;
  /** The keys of the answer, used to unwrap a JSON-Schema envelope. */
  keys?: readonly string[];
  /** The error reported when the text holds no JSON at all. */
  emptyError?: string;
  /** Domain checks. Return `[]` to accept the answer; may check asynchronously. */
  verify?: (value: T) => string[] | Promise<string[]>;
  /** The feedback sent after a rejected answer. */
  corrective: (rejection: string) => string;
  /** How often the model is asked, the first answer included. */
  attempts: number;
}

/** The outcome of a request: the checked answer or the last rejection. */
export type JsonOutcome<T> =
  { ok: true; data: T } | { ok: false; error: string };
