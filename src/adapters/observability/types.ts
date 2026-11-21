import type { NodeTracerProvider } from '@arizeai/phoenix-otel';

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

export interface PhoenixTracing {
  provider: NodeTracerProvider;
  shutdown: () => Promise<void>;
}
