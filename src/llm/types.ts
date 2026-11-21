import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';

/** Minimal chat-model surface the generation stages need; tests inject a fake. */
export interface GenerationModel {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

/** One request: the model, the conversation and the checks of the answer. */
export interface JsonRequest<T> {
  stage: string;
  model: GenerationModel;
  messages: BaseMessage[];
  schema: z.ZodType<T> & Pick<z.ZodObject, 'shape'>;
  verify: (value: T) => string[] | Promise<string[]>;
}

/** The outcome of a request: the checked answer or the last rejection. */
export type JsonOutcome<T> =
  { ok: true; data: T } | { ok: false; error: string };
