import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { loadConfig } from '../config';
import { createChatModel, requestJson, type GenerationModel } from './model';

const schema = z.object({ topic: z.string().min(1) });

function responses(...answers: (BaseMessage | Error)[]): {
  model: GenerationModel;
  invoke: jest.Mock<Promise<BaseMessage>, [BaseMessage[]]>;
} {
  const invoke = jest.fn(
    async (messages: BaseMessage[]): Promise<BaseMessage> => {
      if (messages.length === 0) {
        throw new Error('fake model received no messages');
      }
      const answer = answers.shift();
      if (answer instanceof Error) {
        throw answer;
      }
      if (!answer) {
        throw new Error('fake model ran out of responses');
      }
      return answer;
    },
  );
  return { model: { invoke }, invoke };
}

describe('createChatModel', () => {
  it('uses the OpenAI-compatible client for hosted providers', () => {
    const model = createChatModel(
      loadConfig({
        LLM_PROVIDER: 'openrouter',
        LLM_MODEL: 'example/model',
        LLM_API_KEY: 'test-key',
        LLM_MAX_CONCURRENCY: '2',
      }).chat,
    );
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model).toMatchObject({
      model: 'example/model',
      maxTokens: 8192,
      modelKwargs: { response_format: { type: 'json_object' } },
      clientConfig: { baseURL: 'https://openrouter.ai/api/v1' },
    });
  });

  it('does not request JSON mode when explicitly turned off', () => {
    const model = createChatModel(
      loadConfig({
        LLM_PROVIDER: 'groq',
        LLM_MODEL: 'example/model',
        LLM_API_KEY: 'test-key',
        LLM_JSON_MODE: 'off',
      }).chat,
    );
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model).not.toMatchObject({
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  });
});

describe('requestJson', () => {
  it('extracts JSON from fenced prose and handles braces inside strings', async () => {
    const { model, invoke } = responses(
      new AIMessage(
        'Answer:\n```json\n{"topic":"pets {cats and dogs}"}\n```\nDone.',
      ),
    );
    await expect(
      requestJson({ model, prompt: 'Give a topic', schema }),
    ).resolves.toEqual({
      topic: 'pets {cats and dogs}',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0][0]).toBeInstanceOf(HumanMessage);
  });

  it('skips malformed candidate objects before a later valid JSON answer', async () => {
    const { model } = responses(
      new AIMessage('Example: {not valid JSON}\nActual: {"topic":"valid"}'),
    );
    await expect(
      requestJson({ model, prompt: 'Topic?', schema }),
    ).resolves.toEqual({
      topic: 'valid',
    });
  });

  it('accepts text blocks, schema envelopes, and nested data wrappers', async () => {
    const { model } = responses(
      new AIMessage({
        content: [
          {
            type: 'text',
            text: '{"type":"object","properties":{"data":{"result":{"topic":"animals"}}}}',
          },
        ],
      }),
    );
    await expect(
      requestJson({ model, prompt: 'Topic?', schema }),
    ).resolves.toEqual({
      topic: 'animals',
    });
  });

  it('accepts JSON arrays when the supplied schema expects an array', async () => {
    const { model } = responses(new AIMessage('```json\n["cats","dogs"]\n```'));
    await expect(
      requestJson({
        model,
        prompt: 'List animals',
        schema: z.array(z.string()),
      }),
    ).resolves.toEqual(['cats', 'dogs']);
  });

  it('retries malformed JSON once with explicit feedback and reports each event', async () => {
    const { model, invoke } = responses(
      new AIMessage('{"topic":'),
      new AIMessage('{"topic":"recovered"}'),
    );
    const onAttempt = jest.fn();
    await expect(
      requestJson({ model, prompt: 'Topic?', schema, onAttempt }),
    ).resolves.toEqual({ topic: 'recovered' });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls.map(([event]) => event)).toEqual([
      { attempt: 1 },
      { attempt: 1, issue: 'No valid JSON value found in model response' },
      { attempt: 2 },
    ]);
    const retry = invoke.mock.calls[1]?.[0];
    expect(retry?.[1]).toBeInstanceOf(AIMessage);
    expect(retry?.[2]).toBeInstanceOf(HumanMessage);
    expect(retry?.[2]?.content).toContain('No valid JSON value found');
  });

  it('waits for asynchronous retry logging before asking the model again', async () => {
    const { model, invoke } = responses(
      new AIMessage('not JSON'),
      new AIMessage('{"topic":"recovered"}'),
    );
    let started!: () => void;
    let finishLogging!: () => void;
    const loggingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const loggingFinished = new Promise<void>((resolve) => {
      finishLogging = resolve;
    });
    const request = requestJson({
      model,
      prompt: 'Topic?',
      schema,
      onAttempt: async (event) => {
        if (event.issue) {
          started();
          await loggingFinished;
        }
      },
    });
    await loggingStarted;
    expect(invoke).toHaveBeenCalledTimes(1);
    finishLogging();
    await expect(request).resolves.toEqual({ topic: 'recovered' });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('checks Zod and domain verification before accepting a response', async () => {
    const { model, invoke } = responses(
      new AIMessage('{"topic":42}'),
      new AIMessage('{"topic":"too short"}'),
      new AIMessage('{"topic":"acceptable"}'),
    );
    const events: { attempt: number; issue?: string }[] = [];
    await expect(
      requestJson({
        model,
        prompt: 'Topic?',
        schema,
        attempts: 3,
        verify: ({ topic }) =>
          topic === 'acceptable' ? [] : ['topic not approved'],
        onAttempt: (event) => {
          events.push(event);
        },
      }),
    ).resolves.toEqual({ topic: 'acceptable' });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      { attempt: 1 },
      { attempt: 1, issue: expect.stringContaining('topic') },
      { attempt: 2 },
      { attempt: 2, issue: 'topic not approved' },
      { attempt: 3 },
    ]);
    expect(invoke.mock.calls[2]?.[0][4]?.content).toContain(
      'topic not approved',
    );
  });

  it('awaits an asynchronous verification before the corrective retry', async () => {
    const { model, invoke } = responses(
      new AIMessage('{"topic":"bad SQL"}'),
      new AIMessage('{"topic":"fixed SQL"}'),
    );
    let verificationStarted!: () => void;
    let completeVerification!: (issues: string[]) => void;
    const started = new Promise<void>((resolve) => {
      verificationStarted = resolve;
    });
    const checking = new Promise<string[]>((resolve) => {
      completeVerification = resolve;
    });
    const request = requestJson({
      model,
      prompt: 'Topic?',
      schema,
      verify: ({ topic }) => {
        if (topic === 'bad SQL') {
          verificationStarted();
          return checking;
        }
        return [];
      },
    });
    await started;
    expect(invoke).toHaveBeenCalledTimes(1);
    completeVerification(['SQL syntax check failed']);
    await expect(request).resolves.toEqual({ topic: 'fixed SQL' });
    expect(invoke.mock.calls[1]?.[0][2]?.content).toContain(
      'SQL syntax check failed',
    );
  });

  it('fails with the last validation issue after exhausting attempts', async () => {
    const { model, invoke } = responses(
      new AIMessage('{"topic":5}'),
      new AIMessage('{"topic":false}'),
    );
    await expect(
      requestJson({ model, prompt: 'Topic?', schema }),
    ).rejects.toThrow(/after 2 attempt\(s\): topic:/);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('reports a provider refusal immediately without retrying or exposing a key', async () => {
    const error = Object.assign(
      new Error('Rate limit exceeded for Bearer sk-topsecret12345'),
      { status: 429 },
    );
    const { model, invoke } = responses(error);
    const onAttempt = jest.fn();
    await expect(
      requestJson({ model, prompt: 'Topic?', schema, onAttempt }),
    ).rejects.toThrow(/provider refused.*HTTP 429.*\[REDACTED\]/);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(onAttempt.mock.calls[1]?.[0]).toEqual({
      attempt: 1,
      issue: expect.not.stringContaining('sk-topsecret12345'),
    });
  });

  it('redacts structured provider keys and recognizes a string HTTP status', async () => {
    const error = Object.assign(new Error('api_key="sk-superprivate123"'), {
      status: '401',
    });
    const { model } = responses(error);
    const events: { attempt: number; issue?: string }[] = [];
    await expect(
      requestJson({
        model,
        prompt: 'Topic?',
        schema,
        onAttempt: async (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow(/provider refused.*HTTP 401.*\[REDACTED\]/);
    expect(events).toEqual([
      { attempt: 1 },
      { attempt: 1, issue: expect.not.stringContaining('superprivate') },
    ]);
  });

  it('does not retry an explicit model refusal in a response', async () => {
    const { model, invoke } = responses(
      new AIMessage({
        content: [
          { type: 'text', text: '' },
          { type: 'refusal', refusal: 'Cannot comply' },
        ],
      }),
    );
    await expect(
      requestJson({ model, prompt: 'Topic?', schema }),
    ).rejects.toThrow(/Model refused.*Cannot comply/);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid attempt counts before calling the model', async () => {
    const { model, invoke } = responses(new AIMessage('{"topic":"unused"}'));
    await expect(
      requestJson({ model, prompt: 'Topic?', schema, attempts: 0 }),
    ).rejects.toThrow(/positive integer/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
