export interface ObservabilityConfig {
  provider: 'none' | 'phoenix';
  endpoint: string;
  projectName: string;
}

export interface ObservabilityHandle {
  stageEvent: (
    stage: string,
    kind: 'stage_started' | 'stage_finished' | 'stage_failed',
  ) => void;
  shutdown: () => Promise<void>;
}
