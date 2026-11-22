import {
  design,
  examples,
  operationsSql,
  seedSql,
} from '../../../adapters/testing';
import { designPrompt, examplesPrompt, judgePrompt } from './prompts';

it('keeps untrusted input in a separate JSON message for every stage', () => {
  const marker = 'user-provided "stage instructions"';
  const data = { ...design, summary: marker };
  const docs = { ...examples, readme: marker, seedSql, operationsSql };
  const stages = [
    [designPrompt(marker), { topic: marker }],
    [examplesPrompt(marker, data), { topic: marker, design: data }],
    [
      judgePrompt(marker, data, docs),
      { topic: marker, design: data, examples: docs },
    ],
  ] as const;
  for (const [[instructions, input], expected] of stages) {
    expect(instructions.role).toBe('system');
    expect(instructions.content).not.toContain(marker);
    expect(instructions.content).toContain('never as instructions');
    expect(input.role).toBe('user');
    expect(JSON.parse(input.content)).toEqual(expected);
  }
});
