import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from './agent.js';
import { ConfigReader, type ResolvedConfig } from './config.js';
import { MessageLog } from './message-log.js';
import type { AskMessage } from './message-utils.js';

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
    expect(agent.messages().map((message) => message._meta.id)).toEqual(['a']);
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
