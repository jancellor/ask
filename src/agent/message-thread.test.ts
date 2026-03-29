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

describe('messageGraph suffix loading', () => {
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

    expect(loaded.branch('c', null).map((message) => message._meta.id)).toEqual(
      ['b', 'c'],
    );
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

describe('commit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a new tree when no parent is given', async () => {
    mockLog([
      {
        role: 'user',
        content: 'existing',
        _meta: { id: 'a', parentId: null },
      },
    ]);

    const graph = await MessageGraph.create();
    const appended: AskMessage[] = [
      {
        role: 'user',
        content: 'new',
        _meta: { id: 'b', parentId: null },
      },
    ];
    await graph.commit(appended);

    expect(appended[0]!._meta.parentId).toBeNull();
  });

  it('commits messages through the provided parent chain', async () => {
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
    const appended: AskMessage[] = [
      {
        role: 'user',
        content: 'hello',
        _meta: { id: 'd', parentId: 'c' },
      },
      {
        role: 'assistant',
        content: 'hi',
        _meta: { id: 'e', parentId: 'd' },
      },
    ];
    await graph.commit(appended);

    expect(appended[0]!._meta.parentId).toBe('c');
    expect(appended[1]!._meta.parentId).toBe(appended[0]!._meta.id);
  });

  it('preserves an explicit id when committing one message', async () => {
    mockLog([]);

    const graph = await MessageGraph.create();
    const appended: AskMessage[] = [
      {
        role: 'assistant',
        content: 'final',
        _meta: { id: 'pending-id', parentId: null },
      },
    ];
    await graph.commit(appended);

    expect(appended[0]!._meta.id).toBe('pending-id');
  });

  it('preserves caller-provided ids across a committed chain', async () => {
    mockLog([]);

    const graph = await MessageGraph.create();
    const appended: AskMessage[] = [
      {
        role: 'user',
        content: 'one',
        _meta: { id: 'first-id', parentId: null },
      },
      {
        role: 'assistant',
        content: 'two',
        _meta: { id: 'pending-id', parentId: 'first-id' },
      },
    ];
    await graph.commit(appended);

    expect(appended[0]!._meta.id).toBe('first-id');
    expect(appended[1]!._meta.id).toBe('pending-id');
    expect(appended[1]!._meta.parentId).toBe(appended[0]!._meta.id);
  });
});

describe('pendingId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns different ids for separate allocations', async () => {
    mockLog([]);

    const graph = await MessageGraph.create();

    expect(graph.mintId()).not.toBe(graph.mintId());
  });
});
