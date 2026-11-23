import { asExperimentEvaluator } from '@arizeai/phoenix-client/experiments';
import {
  ASSET_PATHS,
  QA_REPORT_PATH,
  README_PATH,
} from '../../src/workflows/generate/domain';
import { readmeSubstance } from './readmeSubstance';
import {
  STAGE_NAMES,
  type PromptRunOutcome,
  type RejectionReason,
} from './types';

const EXPECTED_ARTIFACTS = [...ASSET_PATHS, README_PATH, QA_REPORT_PATH];

/**
 * Gate checks are reported as failure diagnostics, not scores: an accepted run
 * has already passed them. The scores measure prompt improvement instead.
 */
export function createPromptEvaluators() {
  const firstTry = STAGE_NAMES.map((stage) =>
    asExperimentEvaluator({
      name: `${stage}_first_try`,
      kind: 'CODE',
      evaluate: ({ output }) => {
        const outcome = outcomeOf(output);
        if (!outcome) return noOutput();
        const attempts = outcome.stages[stage].attempts;
        if (!attempts.length)
          return {
            score: null,
            label: 'not_run',
            explanation: `The ${stage} stage did not run.`,
          };
        const reasons = attempts[0].reasons;
        return reasons.length === 0
          ? verdict(
              1,
              'first_try',
              `${stage} was accepted on the first model call.`,
            )
          : verdict(
              0,
              'corrected',
              `${stage} was rejected first: ${reasons.join(', ')}.`,
            );
      },
    }),
  );

  const rejectionReasons = asExperimentEvaluator({
    name: 'rejection_reasons',
    kind: 'CODE',
    evaluate: ({ output }) => {
      const outcome = outcomeOf(output);
      if (!outcome) return noOutput();
      const histogram = new Map<RejectionReason, number>();
      for (const stage of STAGE_NAMES)
        for (const attempt of outcome.stages[stage].attempts)
          for (const reason of attempt.reasons)
            histogram.set(reason, (histogram.get(reason) ?? 0) + 1);

      const ranked = [...histogram.entries()].sort((a, b) => b[1] - a[1]);
      if (!ranked.length)
        return verdict(
          1,
          'clean',
          'Every stage answer was accepted on its first model call.',
        );
      return {
        score: 0,
        label: ranked[0][0],
        metadata: Object.fromEntries(ranked),
        explanation: ranked
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', '),
      };
    },
  });

  const pipelineCompletion = asExperimentEvaluator({
    name: 'pipeline_completion',
    kind: 'CODE',
    evaluate: ({ output }) => {
      const outcome = outcomeOf(output);
      if (!outcome) return noOutput();
      const published = new Set(outcome.published);
      const missing = EXPECTED_ARTIFACTS.filter((path) => !published.has(path));
      const failedStages = STAGE_NAMES.filter(
        (stage) => !outcome.stages[stage].accepted,
      );
      return {
        score:
          (EXPECTED_ARTIFACTS.length - missing.length) /
          EXPECTED_ARTIFACTS.length,
        label: !missing.length
          ? 'published'
          : failedStages.length
            ? 'stage_failed'
            : 'partial',
        metadata: {
          published: outcome.published,
          failedStages,
          errors: outcome.errors,
        },
        explanation: missing.length
          ? `Missing: ${missing.join(', ')}. Failed stages: ${failedStages.join(', ') || 'none'}.`
          : `All ${EXPECTED_ARTIFACTS.length} expected artifacts were published.`,
      };
    },
  });

  const readmeSubstanceScore = asExperimentEvaluator({
    name: 'readme_substance',
    kind: 'CODE',
    evaluate: ({ output }) => {
      const outcome = outcomeOf(output);
      if (!outcome) return noOutput();
      if (!outcome.design || !outcome.examples)
        return verdict(0, 'no_artifacts', 'No accepted design and README.');
      const checks = readmeSubstance(outcome.design, outcome.examples);
      const failed = checks.filter((check) => !check.passed);
      return {
        score: (checks.length - failed.length) / checks.length,
        label: failed.length ? 'thin' : 'substantive',
        metadata: { failed: failed.map((check) => check.name) },
        explanation: failed.length
          ? `Weak content: ${failed.map((check) => check.name).join(', ')}.`
          : `All ${checks.length} content checks passed.`,
      };
    },
  });

  return [
    ...firstTry,
    rejectionReasons,
    pipelineCompletion,
    readmeSubstanceScore,
  ];
}

function verdict(score: number, label: string, explanation: string) {
  return { score, label, explanation };
}

function noOutput() {
  return verdict(0, 'no_output', 'The task returned no usable output.');
}

function outcomeOf(output: unknown): PromptRunOutcome | null {
  return output && typeof output === 'object'
    ? (output as PromptRunOutcome)
    : null;
}
