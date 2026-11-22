/** Settings the tracing adapter needs, passed in by the composition root. */
export interface ObservabilitySettings {
  provider: 'none' | 'phoenix';
  endpoint: string;
  projectName: string;
}

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
