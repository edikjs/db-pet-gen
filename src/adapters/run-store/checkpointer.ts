import { join } from 'node:path';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

export function openRunCheckpointer(workspace: string): {
  saver: BaseCheckpointSaver;
  close: () => void;
} {
  const saver = SqliteSaver.fromConnString(join(workspace, 'checkpoints.db'));
  return { saver, close: () => saver.db.close() };
}
