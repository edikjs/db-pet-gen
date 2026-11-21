import { buildProgram, main } from './run';
import type { RunResult } from '../workflows/generate';
import { loadConfig } from '../config';

const config = loadConfig({
  LLM_PROVIDER: 'openrouter',
  LLM_MODEL: 'fixture',
  LLM_API_KEY: 'test-key',
});
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

describe('topic-only CLI', () => {
  it('passes only the topic while loading the configured model from the environment', async () => {
    const output: string[] = [];
    const load = jest.fn(() => config);
    const generate = jest.fn(async () => result);
    const code = await main(
      ['node', 'cli', 'generate', '--topic', 'Pet records'],
      {
        load,
        generate,
        write: (line) => output.push(line),
        error: () => undefined,
      },
    );
    expect(code).toBe(0);
    expect(load).toHaveBeenCalledWith();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Pet records', config }),
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
    const resume = jest.fn(async () => result);
    expect(
      await main(['node', 'cli', 'resume', 'a-run'], {
        load: () => config,
        resume,
        write: () => undefined,
        error: () => undefined,
      }),
    ).toBe(0);
    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'a-run' }),
    );

    const errors: string[] = [];
    expect(
      await main(['node', 'cli', 'generate', '-t', 'Pet records'], {
        load: () => config,
        generate: async () => {
          throw new Error('provider unavailable');
        },
        error: (line) => errors.push(line),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('provider unavailable');
  });

  it('redacts key-shaped secrets from failures', async () => {
    const errors: string[] = [];
    expect(
      await main(['node', 'cli', 'resume', 'a-run'], {
        load: () => config,
        resume: async () => {
          throw new Error('request rejected with sk-private1234567890abcdef');
        },
        error: (line) => errors.push(line),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('[REDACTED]');
    expect(errors.join('\n')).not.toContain('sk-private1234567890abcdef');
  });
});
