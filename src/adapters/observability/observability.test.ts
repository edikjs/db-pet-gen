import { register, SpanStatusCode } from '@arizeai/phoenix-otel';
import { initObservability } from './observability';
import type { ObservabilityConfig } from './types';

jest.mock('@arizeai/phoenix-otel', () => ({
  register: jest.fn(),
  SpanStatusCode: { ERROR: 2, OK: 1 },
}));
const config: ObservabilityConfig = {
  provider: 'phoenix',
  endpoint: 'http://localhost:6006',
  projectName: 'test-project',
};

it('does not activate tracing when disabled', () => {
  expect(initObservability({ ...config, provider: 'none' })).toBeUndefined();
  expect(register).not.toHaveBeenCalled();
});

it('only exports stage timing and status through a private tracer', async () => {
  const span = { end: jest.fn(), setStatus: jest.fn() };
  const startSpan = jest.fn(() => span);
  const shutdown = jest.fn(async () => undefined);
  jest.mocked(register).mockReturnValue({
    getTracer: () => ({ startSpan }),
    shutdown,
  } as unknown as ReturnType<typeof register>);
  const handle = initObservability(config)!;
  handle.stageEvent('examples', 'stage_started');
  handle.stageEvent('examples', 'stage_failed');
  await handle.shutdown();
  expect(register).toHaveBeenCalledWith({
    url: config.endpoint,
    projectName: config.projectName,
    batch: true,
    global: false,
  });
  expect(startSpan.mock.calls).toEqual([['examples']]);
  expect(span.setStatus.mock.calls).toEqual([[{ code: SpanStatusCode.ERROR }]]);
  expect(span.end).toHaveBeenCalledTimes(1);
  expect(shutdown).toHaveBeenCalledTimes(1);
});
