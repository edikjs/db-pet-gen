import type { ObservabilityProvider, ObservabilityHandle } from './types';

export function observeStages(
  provider: ObservabilityProvider,
): ObservabilityHandle {
  const active = new Map<
    string,
    ReturnType<ObservabilityProvider['startStage']>
  >();
  return {
    stageEvent(stage, kind) {
      if (kind === 'stage_started') {
        active.set(stage, provider.startStage(stage));
        return;
      }
      active.get(stage)?.(kind === 'stage_failed' ? 'error' : 'ok');
      active.delete(stage);
    },
    shutdown: () => provider.shutdown(),
  };
}
