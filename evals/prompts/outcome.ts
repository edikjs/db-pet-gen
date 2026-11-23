import {
  ASSET_PATHS,
  QA_REPORT_PATH,
  README_PATH,
} from '../../src/workflows/generate/domain';
import type { PromptRunOutcome } from './types';

export const EXPECTED_ARTIFACTS = [...ASSET_PATHS, README_PATH, QA_REPORT_PATH];

export function missingArtifacts(outcome: PromptRunOutcome): string[] {
  return EXPECTED_ARTIFACTS.filter((path) => !outcome.published.includes(path));
}

/** Phoenix exposes the output of our typed task as a generic JSON value. */
export function outcomeOf(output: unknown): PromptRunOutcome | null {
  return output && typeof output === 'object'
    ? (output as PromptRunOutcome)
    : null;
}
