import type { runExperiment } from '@arizeai/phoenix-client/experiments';
import { missingArtifacts, outcomeOf } from './outcome';

export function experimentSummary(
  experiment: Awaited<ReturnType<typeof runExperiment>>,
): string {
  const runs = Object.values(experiment.runs);
  const failures = runs.flatMap((run) => {
    const outcome = outcomeOf(run.output);
    if (run.error || !outcome)
      return [
        `  Example ${run.datasetExampleId} — task: ${run.error || 'no output'}`,
      ];
    const missing = missingArtifacts(outcome);
    if (!missing.length) return [];
    const [failure] = Object.entries(outcome.errors);
    const reason = failure
      ? `${failure[0]}: ${failure[1]}`
      : `publish: missing ${missing.join(', ')}`;
    return [`  ${outcome.topic} — ${reason}`];
  });
  const evaluations = experiment.evaluationRuns ?? [];
  const harnessErrors =
    runs.filter((run) => run.error).length +
    evaluations.filter((evaluation) => evaluation.error).length;
  return [
    `Harness errors: ${harnessErrors} | Projects published: ${runs.length - failures.length}/${runs.length}`,
    ...failures,
  ].join('\n');
}
