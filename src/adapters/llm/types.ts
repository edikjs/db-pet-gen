import type { BaseMessage } from '@langchain/core/messages';

/** The minimal chat surface the structured-request adapter needs. */
export interface ChatTransport {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

export type ModelAttempt =
  | { kind: 'accepted' }
  | { kind: 'schema' | 'transport'; error: string }
  | { kind: 'verification'; error: string; value: unknown };

export type AttemptObserver = (stage: string, attempt: ModelAttempt) => void;

export type JsonOutcome<T> =
  { kind: 'accepted'; data: T } | Extract<ModelAttempt, { error: string }>;
