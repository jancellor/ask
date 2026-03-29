import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from './agent.js';
import { ask } from '../index.js';
import { ConfigReader, type ResolvedConfig } from './config.js';
import { generateText } from './generate-text.js';
import { InitPrompt } from './init-prompt.js';
import { MessageLog } from './message-log.js';
import type { AskMessage } from './message-utils.js';

vi.mock('./generate-text.js', () => ({
  generateText: vi.fn(),
}));

function mockLog(messages: AskMessage[]) {
  vi.spyOn(MessageLog, 'create').mockReturnValue({
    read: async () => messages,
    append: async () => {},
  } as unknown as MessageLog);
}

function mockConfig() {
  vi.spyOn(ConfigReader.prototype, 'resolve').mockResolvedValue({
    provider: 'openai',
    model: 'gpt-test',
    variant: null,
    sdkProvider: 'openai',
    sdkModel: 'gpt-test',
    providerSettings: {},
    generateOptions: {},
    languageModel: {} as ResolvedConfig['languageModel'],
  });
}

const mockedGenerateText = vi.mocked(generateText);

function createAbortError(message = 'aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

describe('Agent.create resume behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfig();
  });

  it('resumes from the exact message id provided', async () => {
    mockLog([
      {
        role: 'user',
        content: 'root',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'child',
        _meta: { id: 'b', parentId: 'a' },
      },
    ]);

    const agent = await Agent.create({ resume: 'a' });

    expect(agent.tipId).toBe('a');
  });

  it('uses the last message when resume is true', async () => {
    mockLog([
      {
        role: 'user',
        content: 'first',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'second',
        _meta: { id: 'b', parentId: 'a' },
      },
    ]);

    const agent = await Agent.create({ resume: true });

    expect(agent.tipId).toBe('b');
  });

  it('throws for an unknown resume id', async () => {
    mockLog([]);

    await expect(Agent.create({ resume: 'missing' })).rejects.toThrow(
      'unknown message ID: missing',
    );
  });
});

describe('Agent.ask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLog([]);
    mockConfig();
    vi.spyOn(InitPrompt.prototype, 'build').mockResolvedValue('');
    mockedGenerateText.mockResolvedValue({
      response: {
        messages: [{ role: 'assistant', content: 'reply' }],
      },
      toolCalls: [],
    });
  });

  it('returns a turn whose message stream is the full conversation view', async () => {
    const agent = await Agent.create({});
    const turn = await agent.ask('hello');
    const messages = [];
    for await (const message of turn.messageEvents()) {
      messages.push(message);
    }

    expect(messages.map((message) => message.content)).toEqual([
      'hello',
      'reply',
    ]);
    expect(
      (await turn.completeMessages()).map((message) => message.content),
    ).toEqual(['hello', 'reply']);
  });

  it('exposes the full root-to-tip stream from agent.messageEvents() after ask resolves', async () => {
    const agent = await Agent.create({});
    await agent.ask('hello');

    const messages = [];
    const iterator = agent.messageEvents()[Symbol.asyncIterator]();
    for (let i = 0; i < 2; i += 1) {
      const next = await iterator.next();
      if (next.done) break;
      messages.push(next.value);
    }
    await iterator.return?.();

    expect(messages.map((message) => message.content)).toEqual([
      'hello',
      'reply',
    ]);
  });

  it('finishes an idle messageEvents stream after yielding the snapshot', async () => {
    const agent = await Agent.create({});
    const turn = await agent.ask('hello');
    await turn.completeMessages();

    const iterator = agent.messageEvents()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: expect.objectContaining({ content: 'hello' }),
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: expect.objectContaining({ content: 'reply' }),
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });

  it('returns the final assistant text via the package ask helper', async () => {
    await expect(ask('hello')).resolves.toBe('reply');
  });

  it('uses the turn id for the final appended message only', async () => {
    const agent = await Agent.create({});
    const turn = await agent.ask('hello');
    const messages: AskMessage[] = [];
    for await (const message of turn.messageEvents()) {
      messages.push(message);
    }
    await vi.waitFor(() => expect(agent.tipId).toBe(messages[1]!._meta.id));
    expect(agent.tipId).not.toBe(messages[0]!._meta.id);
  });

  it('keeps failed turns out of committed history', async () => {
    const error = new Error('boom');
    mockedGenerateText.mockRejectedValueOnce(error);

    const agent = await Agent.create({});
    const turn = await agent.ask('hello');

    await expect(turn.completeMessages()).rejects.toBe(error);
    expect(agent.tipId).toBeNull();
  });

  it('keeps aborted turns out of committed history', async () => {
    mockedGenerateText.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener(
            'abort',
            () => reject(createAbortError()),
            { once: true },
          );
        }),
    );

    const agent = await Agent.create({});
    const turn = await agent.ask('hello');
    const iterator = turn.messageEvents()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: expect.objectContaining({ content: 'hello' }),
      done: false,
    });
    await agent.cancel();

    await expect(turn.completeMessages()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(agent.tipId).toBeNull();
    await iterator.return?.();
  });

  it('allows a new ask after a failed turn', async () => {
    const error = new Error('boom');
    mockedGenerateText.mockRejectedValueOnce(error);

    const agent = await Agent.create({});
    const failedTurn = await agent.ask('hello');

    await expect(failedTurn.completeMessages()).rejects.toBe(error);
    const nextTurn = await agent.ask('retry');
    await expect(nextTurn.completeMessages()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'retry' }),
        expect.objectContaining({ content: 'reply' }),
      ]),
    );
  });

  it('rewind updates committed state', async () => {
    mockLog([
      {
        role: 'user',
        content: 'first',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'second',
        _meta: { id: 'b', parentId: 'a' },
      },
      {
        role: 'user',
        content: 'third',
        _meta: { id: 'c', parentId: 'b' },
      },
      {
        role: 'assistant',
        content: 'fourth',
        _meta: { id: 'd', parentId: 'c' },
      },
    ]);

    const agent = await Agent.create({ resume: true });
    await agent.rewind('c');
    const messages: AskMessage[] = [];
    const iterator = agent.messageEvents()[Symbol.asyncIterator]();
    for (let i = 0; i < 2; i += 1) {
      const next = await iterator.next();
      if (next.done) break;
      messages.push(next.value);
    }
    await iterator.return?.();

    expect(messages.map((message) => message.content)).toEqual([
      'first',
      'second',
    ]);
  });

  it('finishes a new messageEvents stream after clear', async () => {
    mockLog([
      {
        role: 'user',
        content: 'first',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'second',
        _meta: { id: 'b', parentId: 'a' },
      },
    ]);

    const agent = await Agent.create({ resume: true });
    await agent.clear();

    const iterator = agent.messageEvents()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });
});
