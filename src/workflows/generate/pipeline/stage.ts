import type { PipelineEvent } from '../../ports';

export interface StageOptions {
  onEvent?: (event: PipelineEvent) => void | Promise<void>;
}

/** Reports the stage boundary and turns checked data into pipeline state. */
export async function stage<T>(
  { onEvent }: StageOptions,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  await onEvent?.({ kind: 'stage_started', stage: name });
  try {
    const result = await action();
    await onEvent?.({ kind: 'stage_finished', stage: name });
    return result;
  } catch (error) {
    await onEvent?.({
      kind: 'stage_failed',
      stage: name,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function requireValue<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Missing ${name} from previous stage`);
  return value;
}
