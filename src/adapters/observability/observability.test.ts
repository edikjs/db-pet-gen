import { initObservability } from './index';

const config = {
  provider: 'none',
  endpoint: 'http://localhost:6006',
  projectName: 'test',
} as const;

it('leaves tracing disabled by default', () => {
  expect(initObservability(config)).toBeUndefined();
});

it('routes stage outcomes and shutdown to an injected provider', async () => {
  const design = jest.fn();
  const examples = jest.fn();
  const startStage = jest
    .fn()
    .mockReturnValueOnce(design)
    .mockReturnValueOnce(examples);
  const shutdown = jest.fn(async () => undefined);
  const handle = initObservability(config, () => ({ startStage, shutdown }))!;
  handle.stageEvent('design', 'stage_started');
  handle.stageEvent('examples', 'stage_started');
  handle.stageEvent('examples', 'stage_failed');
  handle.stageEvent('design', 'stage_finished');
  await handle.shutdown();
  expect(startStage.mock.calls).toEqual([['design'], ['examples']]);
  expect(design.mock.calls).toEqual([['ok']]);
  expect(examples.mock.calls).toEqual([['error']]);
  expect(shutdown).toHaveBeenCalledTimes(1);
});

it('can open and shut down the configured Phoenix SDK', async () => {
  const handle = initObservability({ ...config, provider: 'phoenix' })!;
  await expect(handle.shutdown()).resolves.toBeUndefined();
});
