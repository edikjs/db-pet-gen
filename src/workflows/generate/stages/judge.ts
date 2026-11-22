import type { ModelPort } from '../../ports';
import { JudgeSchema, type Design, type Examples, type Judge } from '../domain';
import { judgePrompt } from './prompts';

function judgeViolations(value: Judge): string[] {
  if (value.problems.length > 0) return value.problems;
  if (value.matches) return [];
  return ['The SQL does not match the checked data.'];
}

export async function runJudge(
  model: ModelPort,
  topic: string,
  design: Design,
  examples: Examples,
): Promise<void> {
  await model.json({
    stage: 'judge',
    messages: judgePrompt(topic, design, examples),
    schema: JudgeSchema,
    verify: judgeViolations,
  });
}
