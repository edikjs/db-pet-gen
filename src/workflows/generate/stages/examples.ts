import type { ModelPort } from '../../ports';
import {
  ASSET_PATHS,
  ExamplesAnswerSchema,
  validateSeedData,
  type Design,
  type Examples,
  type ExamplesAnswer,
} from '../domain';
import { renderOperationsSql, renderSeedSql } from '../render';
import { validateOperations, validateReadme } from '../rules';
import { examplesPrompt } from './prompts';

function verifyExamples(examples: ExamplesAnswer, design: Design): string[] {
  return [
    ...validateSeedData(examples, design),
    ...validateReadme(examples.readme, ASSET_PATHS, design.mermaid),
    ...validateOperations(examples, design),
  ];
}

export async function runExamples(
  model: ModelPort,
  topic: string,
  design: Design,
): Promise<Examples> {
  const answer = await model.json({
    stage: 'examples',
    messages: examplesPrompt(topic, design),
    schema: ExamplesAnswerSchema,
    verify: (examples) => verifyExamples(examples, design),
  });
  return {
    ...answer,
    seedSql: renderSeedSql(design, answer),
    operationsSql: renderOperationsSql(answer),
  };
}
