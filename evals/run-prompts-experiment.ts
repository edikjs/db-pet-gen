import 'dotenv/config';
import { runExperiment } from '@arizeai/phoenix-client/experiments';
import type { AppConfig } from '../src/config';
import { loadConfig } from '../src/config';
import { errorMessage } from '../src/shared';
import {
  PROMPT_DATASET_DESCRIPTION,
  PROMPT_DATASET_NAME,
  promptExamples,
  type PromptInput,
} from './datasets';
import { createPhoenixClient, ensureDataset } from './providers';
import {
  createPromptEvaluators,
  experimentSummary,
  PromptStagesUnderTest,
} from './prompts';

async function main(): Promise<void> {
  await runPromptExperiment(loadConfig());
}

async function runPromptExperiment(config: AppConfig): Promise<void> {
  const client = createPhoenixClient(config);
  const datasetId = await ensureDataset(
    client,
    PROMPT_DATASET_NAME,
    PROMPT_DATASET_DESCRIPTION,
    promptExamples,
  );
  console.log(`Dataset "${PROMPT_DATASET_NAME}" ready (${datasetId}).`);

  const underTest = PromptStagesUnderTest.create(config);
  const experimentName = `db-pet-gen-prompts ${new Date().toISOString()}`;
  console.log(
    `Running experiment "${experimentName}" on ${config.chat.provider}/${config.chat.model}…`,
  );

  const experiment = await runExperiment({
    client,
    experimentName,
    dataset: { datasetId },
    task: (example) => underTest.run(example.input as PromptInput),
    evaluators: createPromptEvaluators(),
    concurrency: 2,
    setGlobalTracerProvider: false,
  });

  console.log(experimentSummary(experiment));
  console.log(`Phoenix UI: ${config.observability.endpoint}`);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
