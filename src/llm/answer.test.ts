import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  messageText,
  parseJsonObject,
  parseJsonValue,
  unwrapEnvelope,
} from './answer';

describe('messageText', () => {
  it('reads the text of an answer', () => {
    expect(messageText(new AIMessage('{"sources": []}'))).toBe(
      '{"sources": []}',
    );
  });

  it('joins the blocks of an answer', () => {
    const message = new AIMessage([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ]);

    expect(messageText(message)).toBe('firstsecond');
  });

  it('reads nothing out of an empty answer', () => {
    expect(messageText(new AIMessage(''))).toBe('');
  });
});

describe('parseJsonObject', () => {
  it('reads the object out of an answer', () => {
    expect(parseJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('reads nothing out of an answer without an object', () => {
    expect(parseJsonObject('no json here')).toBeNull();
  });

  it('reads nothing out of a broken object', () => {
    expect(parseJsonObject('{"a": ')).toBeNull();
  });

  it('reads nothing out of an array', () => {
    expect(parseJsonObject('[1, 2]')).toBeNull();
  });
});

describe('unwrapEnvelope', () => {
  it('leaves a genuine answer alone', () => {
    expect(unwrapEnvelope({ a: 1 }, ['a'])).toEqual({ a: 1 });
  });

  it('reads the answer out of a JSON-Schema envelope', () => {
    const envelope = {
      type: 'object',
      properties: { a: 1 },
    };

    expect(unwrapEnvelope(envelope, ['a'])).toEqual({ a: 1 });
  });
});

describe('parseJsonValue', () => {
  it('reads the object out of an answer', () => {
    expect(parseJsonValue('answer: {"a": 1}')).toEqual({ a: 1 });
  });

  it('reads the array out of an answer', () => {
    expect(parseJsonValue('answer: [1, 2]')).toEqual([1, 2]);
  });

  it('reads nothing out of an answer without JSON', () => {
    expect(parseJsonValue('no json here')).toBeNull();
  });

  it('reads nothing out of a broken value', () => {
    expect(parseJsonValue('{"a": ')).toBeNull();
  });
});

describe('the messages of a stage', () => {
  it('keeps the human message and the answer of the model apart', () => {
    const messages = [new HumanMessage('question'), new AIMessage('answer')];

    expect(messages.map((message) => messageText(message))).toEqual([
      'question',
      'answer',
    ]);
  });
});
