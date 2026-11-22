import { register, SpanStatusCode } from '@arizeai/phoenix-otel';
import { createPhoenixProvider } from './index';

jest.mock('@arizeai/phoenix-otel', () => ({
  register: jest.fn(),
  SpanStatusCode: { ERROR: 2, OK: 1 },
}));

it('exports only stage timing and status through a private tracer', async () => {
  const span = { end: jest.fn(), setStatus: jest.fn() };
  const startSpan = jest.fn(() => span);
  const shutdown = jest.fn(async () => undefined);
  const sdk = jest.requireMock<{ register: jest.Mock }>(
    '@arizeai/phoenix-otel',
  );
  sdk.register.mockReturnValue({ getTracer: () => ({ startSpan }), shutdown });
  const provider = createPhoenixProvider({
    endpoint: 'http://localhost:6006',
    projectName: 'test',
  });
  provider.startStage('examples')('error');
  await provider.shutdown();
  expect(register).toHaveBeenCalledWith({
    url: 'http://localhost:6006',
    projectName: 'test',
    batch: true,
    global: false,
  });
  expect(startSpan.mock.calls).toEqual([['examples']]);
  expect(span.setStatus.mock.calls).toEqual([[{ code: SpanStatusCode.ERROR }]]);
  expect(span.end).toHaveBeenCalledTimes(1);
  expect(shutdown).toHaveBeenCalledTimes(1);
});
