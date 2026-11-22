import { buildProgram, main } from './run';
import type { GenerateWorkflow, RunResult } from '../workflows';

const result: RunResult = {
  runId: 'a-run',
  workspace: '/tmp/a-run',
  readmePath: '/tmp/a-run/README.md',
  state: {
    topic: 'Pet records',
    design: null,
    examples: null,
  },
};

function fakeWorkflow(
  overrides: Partial<GenerateWorkflow> = {},
): GenerateWorkflow & { generate: jest.Mock; resume: jest.Mock } {
  return {
    generate: jest.fn(async () => result),
    resume: jest.fn(async () => result),
    ...overrides,
  } as GenerateWorkflow & { generate: jest.Mock; resume: jest.Mock };
}

describe('topic-only CLI', () => {
  it('passes only the topic to the generation port', async () => {
    const output: string[] = [];
    const workflow = fakeWorkflow();
    const code = await main(['node', 'cli', 'generate', 'Pet records'], {
      workflow,
      write: (line) => output.push(line),
      error: () => undefined,
    });
    expect(code).toBe(0);
    expect(workflow.generate).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Pet records' }),
    );
    expect(output.join('\n')).toContain('README.md');
  });

  it('offers no provider, model or endpoint CLI overrides', () => {
    const commands = buildProgram().commands.filter((command) =>
      ['generate', 'resume'].includes(command.name()),
    );
    expect(commands).toHaveLength(2);
    for (const command of commands) {
      const flags = command.options.map((option) => option.long);
      expect(flags).not.toContain('--provider');
      expect(flags).not.toContain('--model');
      expect(flags).not.toContain('--base-url');
    }
  });

  it('runs resume by id and gives a nonzero result on failure', async () => {
    const workflow = fakeWorkflow();
    expect(
      await main(['node', 'cli', 'resume', 'a-run'], {
        workflow,
        write: () => undefined,
        error: () => undefined,
      }),
    ).toBe(0);
    expect(workflow.resume).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'a-run' }),
    );

    const errors: string[] = [];
    expect(
      await main(['node', 'cli', 'generate', 'Pet records'], {
        workflow: fakeWorkflow({
          generate: async () => {
            throw new Error('provider unavailable');
          },
        }),
        error: (line) => errors.push(line),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('provider unavailable');
  });

  it('redacts key-shaped secrets from failures', async () => {
    const errors: string[] = [];
    expect(
      await main(['node', 'cli', 'resume', 'a-run'], {
        workflow: fakeWorkflow({
          resume: async () => {
            throw new Error('request rejected with sk-private1234567890abcdef');
          },
        }),
        error: (line) => errors.push(line),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('[REDACTED]');
    expect(errors.join('\n')).not.toContain('sk-private1234567890abcdef');
  });
});
