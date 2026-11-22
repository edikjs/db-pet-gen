export interface ObservabilityProvider {
  startStage(stage: string): (status: 'ok' | 'error') => void;
  shutdown(): Promise<void>;
}

export interface ObservabilityHandle {
  stageEvent: (
    stage: string,
    kind: 'stage_started' | 'stage_finished' | 'stage_failed',
  ) => void;
  shutdown: () => Promise<void>;
}
