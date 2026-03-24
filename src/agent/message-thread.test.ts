import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskMessage } from './message-utils.js';
import { MessageGraph } from './message-graph.js';
import { MessageLog } from './message-log.js';

function mockLog(messages: AskMessage[]) {
  vi.spyOn(MessageLog, 'create').mockReturnValue({
    read: async () => messages,
    append: async () => {},
  } as unknown as MessageLog);
}

describe('messageThread suffix loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a partial suffix and stops traversal at the first missing ancestor', async () => {
    mockLog([
      {
        role: 'user',
        content: 'second',
        _meta: { id: 'b', parentId: 'a' },
      },
      {
        role: 'user',
        content: 'third',
        _meta: { id: 'c', parentId: 'b' },
      },
    ]);

    const loaded = await MessageGraph.create();

    expect(loaded.thread('c').map((message) => message._meta.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('returns null when rewind leaves the loaded suffix before hitting a boundary', async () => {
    mockLog([
      {
        role: 'user',
        content: 'second',
        _meta: { id: 'b', parentId: 'a' },
      },
      {
        role: 'user',
        content: 'third',
        _meta: { id: 'c', parentId: 'b' },
      },
    ]);

    const loaded = await MessageGraph.create();

    expect(loaded.rewindBoundary('c')).toBeNull();
  });
});

describe('append', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a new thread when no parent is given', async () => {
    mockLog([
      {
        role: 'user',
        content: 'existing',
        _meta: { id: 'a', parentId: null },
      },
    ]);

    const graph = await MessageGraph.create();
    const appended = await graph.append(
      null,
      [{ role: 'user', content: 'new' }],
      {},
    );

    expect(appended[0]!._meta.parentId).toBeNull();
  });

  it('threads appended messages through the provided parent', async () => {
    mockLog([
      {
        role: 'user',
        content: 'root',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'middle',
        _meta: { id: 'b', parentId: 'a' },
      },
      {
        role: 'user',
        content: 'leaf',
        _meta: { id: 'c', parentId: 'b' },
      },
    ]);

    const graph = await MessageGraph.create();
    const appended = await graph.append(
      'c',
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      {},
    );

    expect(appended[0]!._meta.parentId).toBe('c');
    expect(appended[1]!._meta.parentId).toBe(appended[0]!._meta.id);
  });
});
