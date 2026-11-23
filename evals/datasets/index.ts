import dataset from './prompts.json';

/** The checked input of one staged-prompt dataset example. */
export type PromptInput = { readonly topic: string };

/** One dataset example: the topic under test. */
export interface PromptExample {
  readonly input: PromptInput;
}

export const PROMPT_DATASET_NAME: string = dataset.name;

export const PROMPT_DATASET_DESCRIPTION: string = dataset.description;

export const promptExamples: PromptExample[] = dataset.examples;
