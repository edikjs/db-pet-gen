import { createTraceAdapter } from './index';

const config = {
  provider: 'none',
  endpoint: 'http://localhost:6006',
  projectName: 'test',
} as const;

it('leaves tracing disabled by default', async () => {
  const trace = createTraceAdapter(config);
  expect(() => trace.stageEvent('design', 'stage_started')).not.toThrow();
  await expect(trace.shutdown()).resolves.toBeUndefined();
});

it('routes stage outcomes and shutdown to an injected provider', async () => {
  const design = jest.fn();
  const examples = jest.fn();
  const startStage = jest
    .fn()
    .mockReturnValueOnce(design)
    .mockReturnValueOnce(examples);
  const shutdown = jest.fn(async () => undefined);
  const trace = createTraceAdapter(config, () => ({ startStage, shutdown }));
  trace.stageEvent('design', 'stage_started');
  trace.stageEvent('examples', 'stage_started');
  trace.stageEvent('examples', 'stage_failed');
  trace.stageEvent('design', 'stage_finished');
  await trace.shutdown();
  expect(startStage.mock.calls).toEqual([['design'], ['examples']]);
  expect(design.mock.calls).toEqual([['ok']]);
  expect(examples.mock.calls).toEqual([['error']]);
  expect(shutdown).toHaveBeenCalledTimes(1);
});

it('can open and shut down the configured Phoenix SDK', async () => {
  const trace = createTraceAdapter({ ...config, provider: 'phoenix' });
  await expect(trace.shutdown()).resolves.toBeUndefined();
});
