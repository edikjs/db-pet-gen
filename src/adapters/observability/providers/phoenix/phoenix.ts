import { register, SpanStatusCode } from '@arizeai/phoenix-otel';
import type { ObservabilityProvider, ObservabilitySettings } from '../..';

export function createPhoenixProvider({
  projectName,
  endpoint,
}: Pick<
  ObservabilitySettings,
  'projectName' | 'endpoint'
>): ObservabilityProvider {
  const sdk = register({
    projectName,
    url: endpoint,
    batch: true,
    global: false,
  });
  const tracer = sdk.getTracer('db-pet-gen');
  return {
    startStage(stage) {
      const span = tracer.startSpan(stage);
      return (status) => {
        span.setStatus({
          code: status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        });
        span.end();
      };
    },
    shutdown: () => sdk.shutdown(),
  };
}
