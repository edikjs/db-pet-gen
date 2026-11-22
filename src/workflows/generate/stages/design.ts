import type { ModelPort } from '../../ports';
import { DesignAnswerSchema, type Design } from '../domain';
import { renderDiagram } from '../render';
import { validateDdl } from '../rules';
import { designPrompt } from './prompts';

/** A renderer failure is a generator error, not a corrective model turn. */
export async function runDesign(
  model: ModelPort,
  topic: string,
): Promise<Design> {
  const answer = await model.json({
    stage: 'design',
    messages: designPrompt(topic),
    schema: DesignAnswerSchema,
    verify: (value) => validateDdl(value.ddl, value),
  });
  return { ...answer, mermaid: await renderDiagram(answer) };
}
