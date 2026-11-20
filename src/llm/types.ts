import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';

/** Minimal chat-model surface the generation stages need; tests inject a fake. */
export interface GenerationModel {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

/** Where an answer sits in the retry sequence. */
export interface JsonAttempt {
  /** The zero-based number of the answer being checked. */
  readonly attempt: number;
  /** How often the model is asked in total. */
  readonly attempts: number;
  /** Whether this is the last answer the request will read. */
  readonly last: boolean;
}

/** One request: the model, the conversation and the checks of the answer. */
export interface JsonRequest<T> {
  /** The model that answers. */
  model: GenerationModel;
  /** The conversation so far; the request appends to a copy. */
  messages: BaseMessage[];
  /** The schema the answer is validated with. */
  schema: z.ZodType<T>;
  /**
   * Turns the text of an answer into the value the schema validates. Defaults
   * to the first JSON object of the text, unwrapped with `keys` when given.
   */
  prepare?: (text: string, message: BaseMessage) => unknown;
  /** The keys of the answer, used to unwrap a JSON-Schema envelope. */
  keys?: readonly string[];
  /** The error reported when the text holds no JSON at all. */
  emptyError?: string | ((text: string) => string);
  /** Domain checks. Return `[]` to accept the answer. */
  verify?: (value: T, attempt: JsonAttempt) => string[];
  /** Soft checks: a failed answer is kept as best effort while attempts remain. */
  soft?: (value: T) => string[];
  /** The feedback sent after a rejected answer. */
  corrective: (rejection: string) => string;
  /** How often the model is asked, the first answer included. */
  attempts: number;
}

/** The outcome of a request: the checked answer or the last rejection. */
export type JsonOutcome<T> =
  { ok: true; data: T; bestEffort: boolean } | { ok: false; error: string };
