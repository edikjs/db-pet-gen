import { SpanStatusCode } from '@arizeai/phoenix-otel';
import { initPhoenix } from './providers';
import type { ObservabilityConfig, ObservabilityHandle } from './types';

export function initObservability(
  config: ObservabilityConfig,
): ObservabilityHandle | undefined {
  if (config.provider !== 'phoenix') {
    return undefined;
  }

  const tracing = initPhoenix(config);
  const tracer = tracing.provider.getTracer('db-pet-gen');
  const spans = new Map<string, ReturnType<typeof tracer.startSpan>>();
  return {
    stageEvent(stage, kind) {
      if (kind === 'stage_started') {
        spans.set(stage, tracer.startSpan(stage));
        return;
      }
      const span = spans.get(stage);
      span?.setStatus({
        code:
          kind === 'stage_failed' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span?.end();
      spans.delete(stage);
    },
    shutdown: tracing.shutdown,
  };
}
