import { createClient } from '@arizeai/phoenix-client';
import { createDataset, getDataset } from '@arizeai/phoenix-client/datasets';
import type { AppConfig } from '../../src/config';

type PhoenixClient = ReturnType<typeof createClient>;

/** One dataset example whose input shape is known to the calling harness. */
interface DatasetExample<TInput extends Record<string, unknown>> {
  readonly input: TInput;
}

export function createPhoenixClient(config: AppConfig): PhoenixClient {
  return createClient({
    options: { baseUrl: config.observability.endpoint },
  });
}

/** Reuse a named dataset across experiments so score trends stay comparable. */
export async function ensureDataset<TInput extends Record<string, unknown>>(
  client: PhoenixClient,
  name: string,
  description: string,
  examples: readonly DatasetExample<TInput>[],
): Promise<string> {
  try {
    const existing = await getDataset({
      client,
      dataset: { datasetName: name },
    });
    return existing.id;
  } catch {
    const created = await createDataset({
      client,
      name,
      description,
      examples: examples.map(({ input }) => ({
        input: { ...input },
        output: {},
      })),
    });
    return created.datasetId;
  }
}
