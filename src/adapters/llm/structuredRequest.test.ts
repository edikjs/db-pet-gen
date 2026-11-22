import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { StructuredRequest } from '../../workflows/ports';
import { requestJson } from './structuredRequest';
import type { ChatTransport } from './types';

const AnswerSchema = z.object({ value: z.number() });

/** A transport that answers with the given texts and records the prompts. */
function createTransport(
  answers: readonly (string | Error)[],
  calls: string[] = [],
): ChatTransport {
  let call = 0;
  return {
    invoke: async (messages) => {
      calls.push(String(messages[messages.length - 1]?.content ?? ''));
      const answer = answers[Math.min(call, answers.length - 1)];
      call += 1;
      if (answer instanceof Error) throw answer;
      return new AIMessage(answer);
    },
  };
}

function ask(
  model: ChatTransport,
  verify: StructuredRequest<z.infer<typeof AnswerSchema>>['verify'] = () => [],
) {
  return requestJson({
    stage: 'fixture',
    model,
    messages: [{ role: 'user', content: 'Give me the answer.' }],
    schema: AnswerSchema,
    verify,
  });
}

describe('requestJson', () => {
  it('returns the answer of the first call when it is usable', async () => {
    await expect(ask(createTransport(['{"value": 1}']))).resolves.toEqual({
      value: 1,
    });
  });

  it('asks again with the corrective message when the schema rejects the answer', async () => {
    const calls: string[] = [];
    const model = createTransport(['{"value": "no"}', '{"value": 2}'], calls);

    await expect(ask(model)).resolves.toEqual({ value: 2 });
    expect(JSON.parse(calls[1])).toEqual({
      validationFeedback: expect.stringContaining('value'),
    });
  });

  it.each(['gsk_synthetic', 'opk_synthetic'])(
    'keeps echoed %s out of the conversation and diagnostics',
    async (apiKey) => {
      const calls: string[] = [];
      const model = createTransport(
        [new Error(`network down for ${apiKey}`), '{"value": 3}'],
        calls,
      );

      await expect(ask(model)).rejects.toThrow(
        new Error(
          'The model did not return a usable fixture: The provider request failed; check the local client diagnostic.',
        ),
      );
      expect(calls).toEqual(['Give me the answer.']);
    },
  );

  it('reports a rate-limited call instead of asking again', async () => {
    const calls: string[] = [];
    const limit = Object.assign(
      new Error(
        '429 Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7975, Requested 3779. Please try again in 28.155s.',
      ),
      { status: 429 },
    );
    const model = createTransport([limit, '{"value": 3}'], calls);

    await expect(ask(model)).rejects.toThrow(
      /rate-limited.*LLM_MAX_CONCURRENCY/u,
    );
    expect(calls).toHaveLength(1);
  });

  it('reports the last rejection when the attempts run out', async () => {
    const calls: string[] = [];
    await expect(
      ask(createTransport(['not JSON', '{"value":"no"}'], calls)),
    ).rejects.toThrow('value');
    expect(calls).toHaveLength(2);
  });

  it('reports an empty-answer error when the text holds no JSON', async () => {
    const model = createTransport(['no json here']);

    await expect(ask(model)).rejects.toThrow(
      'the answer was not a JSON object',
    );
  });

  it('awaits asynchronous domain checks before accepting an answer', async () => {
    const model = createTransport(['{"value": 1}', '{"value": 2}']);

    await expect(
      ask(model, async (answer) =>
        answer.value === 1 ? ['the value is too small'] : [],
      ),
    ).resolves.toEqual({ value: 2 });
  });

  it('maps a neutral system message to a chat system message', async () => {
    const messages: string[] = [];
    const model: ChatTransport = {
      invoke: async (sent) => {
        messages.push(String(sent[0]?.content));
        return new AIMessage('{"value": 1}');
      },
    };
    await requestJson({
      stage: 'fixture',
      model,
      messages: [{ role: 'system', content: 'instructions' }],
      schema: AnswerSchema,
      verify: () => [],
    });
    expect(messages).toEqual(['instructions']);
  });
});
