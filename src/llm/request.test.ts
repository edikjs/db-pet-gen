import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { requestJson } from './request';
import type { GenerationModel, JsonRequest } from './types';

const AnswerSchema = z.object({ value: z.number() });

/** A model that answers with the given texts and records the prompts. */
function createModel(
  answers: readonly (string | Error)[],
  calls: string[] = [],
): GenerationModel {
  let call = 0;
  return {
    invoke: async (messages) => {
      calls.push(String(messages[messages.length - 1]?.content ?? ''));
      const answer = answers[Math.min(call, answers.length - 1)];
      call += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return new AIMessage(answer);
    },
  };
}

function request(
  model: GenerationModel,
  overrides: Partial<JsonRequest<z.infer<typeof AnswerSchema>>> = {},
): JsonRequest<z.infer<typeof AnswerSchema>> {
  return {
    model,
    messages: [new HumanMessage('Give me the answer.')],
    schema: AnswerSchema,
    corrective: (rejection) => `Correct this: ${rejection}`,
    attempts: 2,
    ...overrides,
  };
}

describe('requestJson', () => {
  it('returns the answer of the first call when it is usable', async () => {
    const outcome = await requestJson(request(createModel(['{"value": 1}'])));

    expect(outcome).toEqual({
      ok: true,
      data: { value: 1 },
      bestEffort: false,
    });
  });

  it('asks again with the corrective message when the schema rejects the answer', async () => {
    const calls: string[] = [];
    const model = createModel(['{"value": "no"}', '{"value": 2}'], calls);

    const outcome = await requestJson(request(model));

    expect(outcome).toEqual({
      ok: true,
      data: { value: 2 },
      bestEffort: false,
    });
    expect(calls[1]).toContain('Correct this:');
    expect(calls[1]).toContain('value');
  });

  it('asks again when a model call throws, with a redacted error', async () => {
    const calls: string[] = [];
    const model = createModel(
      [new Error('network down for Bearer sk-private12345'), '{"value": 3}'],
      calls,
    );

    const outcome = await requestJson(request(model));

    expect(outcome).toEqual({
      ok: true,
      data: { value: 3 },
      bestEffort: false,
    });
    expect(calls[1]).toContain('network down');
    expect(calls[1]).toContain('[REDACTED]');
    expect(calls[1]).not.toContain('sk-private12345');
  });

  it('reports a rate-limited call instead of asking again', async () => {
    const calls: string[] = [];
    const limit = Object.assign(
      new Error(
        '429 Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7975, Requested 3779. Please try again in 28.155s.',
      ),
      { status: 429 },
    );
    const model = createModel([limit, '{"value": 3}'], calls);

    const outcome = await requestJson(request(model));

    expect(calls).toHaveLength(1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('429 Rate limit reached');
      expect(outcome.error).toContain('LLM_MAX_CONCURRENCY');
    }
  });

  it('reports the last rejection when the attempts run out', async () => {
    const outcome = await requestJson(
      request(createModel(['{"value": "no"}'])),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('value');
    }
  });

  it('keeps the best answer when only the soft checks fail', async () => {
    const model = createModel(['{"value": 1}', '{"value": 2}']);

    const outcome = await requestJson(
      request(model, {
        soft: (answer) =>
          answer.value === 2 ? [] : ['the value is too small'],
      }),
    );

    expect(outcome).toEqual({
      ok: true,
      data: { value: 2 },
      bestEffort: false,
    });
  });

  it('returns the last soft-failing answer as best effort when no answer is clean', async () => {
    const model = createModel(['{"value": 1}']);

    const outcome = await requestJson(
      request(model, { soft: () => ['a style tell remains'] }),
    );

    expect(outcome).toEqual({
      ok: true,
      data: { value: 1 },
      bestEffort: true,
    });
  });

  it('reports the configured empty-answer error when the text holds no JSON', async () => {
    const model = createModel(['no json here']);

    const outcome = await requestJson(
      request(model, { emptyError: 'the answer was not a JSON object' }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBe('the answer was not a JSON object');
    }
  });

  it('reads the empty-answer error from the text of the answer', async () => {
    const model = createModel(['no json here']);

    const outcome = await requestJson(
      request(model, {
        emptyError: (text) => `the answer "${text}" was not a JSON object`,
      }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBe(
        'the answer "no json here" was not a JSON object',
      );
    }
  });

  it('tells the checks which attempt they are reading', async () => {
    const seen: { attempt: number; last: boolean }[] = [];
    const model = createModel(['{"value": 1}', '{"value": 2}']);

    const outcome = await requestJson(
      request(model, {
        verify: (_answer, attempt) => {
          seen.push({ attempt: attempt.attempt, last: attempt.last });
          return attempt.last ? [] : ['not the last answer yet'];
        },
      }),
    );

    expect(outcome).toEqual({
      ok: true,
      data: { value: 2 },
      bestEffort: false,
    });
    expect(seen).toEqual([
      { attempt: 0, last: false },
      { attempt: 1, last: true },
    ]);
  });

  it('awaits asynchronous domain checks before accepting an answer', async () => {
    const model = createModel(['{"value": 1}', '{"value": 2}']);

    const outcome = await requestJson(
      request(model, {
        verify: async (answer) =>
          answer.value === 1 ? ['the value is too small'] : [],
      }),
    );

    expect(outcome).toEqual({
      ok: true,
      data: { value: 2 },
      bestEffort: false,
    });
  });

  it('passes the whole answer message to the reader', async () => {
    const model = createModel(['{"value": 1}']);
    let metadata: unknown = null;

    await requestJson(
      request(model, {
        prepare: (text, message) => {
          metadata = message.response_metadata;
          return JSON.parse(text);
        },
      }),
    );

    expect(metadata).toEqual({});
  });
});
