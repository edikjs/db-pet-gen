import type { Design, Examples } from '../../src/workflows/generate/domain';

export const STAGE_NAMES = ['design', 'examples', 'judge'] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** Why a model call was not accepted; an empty list means it was accepted. */
export type RejectionReason =
  'schema' | 'transport' | 'ddl' | 'seed' | 'readme' | 'operations' | 'judge';

export interface StageAttempt {
  readonly reasons: readonly RejectionReason[];
}

export interface StageRun {
  readonly attempts: readonly StageAttempt[];
  readonly accepted: boolean;
}

export type StageRuns = Record<StageName, StageRun>;

export type RunErrors = Partial<Record<StageName | 'publish', string>>;

/** JSON-safe result of one topic through all three model stages and publish. */
export interface PromptRunOutcome {
  readonly topic: string;
  readonly design: Design | null;
  readonly examples: Examples | null;
  readonly stages: StageRuns;
  readonly errors: RunErrors;
  readonly published: readonly string[];
}
