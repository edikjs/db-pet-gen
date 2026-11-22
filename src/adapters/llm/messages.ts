import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { PromptMessage } from '../../workflows/ports';

export function toChatMessages(
  messages: readonly PromptMessage[],
): BaseMessage[] {
  return messages.map((message) =>
    message.role === 'system'
      ? new SystemMessage(message.content)
      : new HumanMessage(message.content),
  );
}
