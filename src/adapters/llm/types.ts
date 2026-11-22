import type { BaseMessage } from '@langchain/core/messages';

/** The minimal chat surface the structured-request adapter needs. */
export interface ChatTransport {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}
