import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../config';
import { redact } from '../shared';
import {
  resumeRun,
  runGenerate,
  type PipelineEvent,
  type RunResult,
} from '../workflows/generate';
import type { CliDependencies } from './types';

function formatError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  const text = messages.join('\nCaused by: ') || String(error);
  return redact(text, process.env.LLM_API_KEY);
}

export function buildProgram(dependencies: CliDependencies = {}): Command {
  const program = new Command();
  const load = dependencies.load ?? (() => loadConfig());
  const generate = dependencies.generate ?? runGenerate;
  const resume = dependencies.resume ?? resumeRun;
  const write = dependencies.write ?? console.log;
  const error = dependencies.error ?? console.error;

  async function runWithProgress(
    label: string,
    action: (onProgress: (event: PipelineEvent) => void) => Promise<RunResult>,
  ) {
    const spinner = process.stderr.isTTY
      ? ora({ text: label, stream: process.stderr }).start()
      : null;
    let result: RunResult;
    try {
      result = await action((event) => {
        const text = `${event.stage}: ${event.kind.replaceAll('_', ' ')}${event.detail ? ` — ${event.detail}` : ''}`;
        if (spinner) spinner.text = text;
        else error(text);
      });
    } finally {
      spinner?.stop();
    }
    write(chalk.green(`Generated: ${result.readmePath}`));
    return result;
  }

  program
    .name('db-pet-gen')
    .description('Generate a documented SQL database project from a topic.')
    .version('1.0.0');
  program
    .command('generate')
    .description('Generate a project from one topic')
    .requiredOption('-t, --topic <topic>', 'the domain to generate')
    .action(async (options: { topic: string }) => {
      const config = load();
      const result = await runWithProgress(
        'Preparing generation...',
        (onProgress) =>
          generate({
            topic: options.topic,
            config,
            onRunStarted: (runId, workspace) =>
              error(`Run started: ${runId}\nWorkspace: ${workspace}`),
            onProgress,
          }),
      );
      write(
        `Run id: ${result.runId}\nQA: ${result.workspace}/qa-report.json\nLog: ${result.workspace}/events.jsonl`,
      );
    });

  program
    .command('resume')
    .description('Retry a failed or interrupted run')
    .argument('<run-id>', 'the run to resume')
    .action(async (runId: string) => {
      const config = load();
      const result = await runWithProgress(
        `Resuming ${runId}...`,
        (onProgress) => resume({ runId, config, onProgress }),
      );
      write(`Run id: ${result.runId}\nLog: ${result.workspace}/events.jsonl`);
    });
  return program;
}

export async function main(
  argv: string[] = process.argv,
  dependencies: CliDependencies = {},
): Promise<number> {
  try {
    await buildProgram(dependencies).parseAsync(argv, { from: 'node' });
    return 0;
  } catch (failure) {
    (dependencies.error ?? console.error)(chalk.red(formatError(failure)));
    return 1;
  }
}
