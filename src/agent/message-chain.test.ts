import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskMessage } from './message-utils.js';
import { MessageGraph } from './message-graph.js';
import { MessageLog } from './message-log.js';

describe('messageChain suffix loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a partial suffix and stops traversal at the first missing ancestor', async () => {
    const messages: AskMessage[] = [
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
    ];

    vi.spyOn(MessageLog, 'create').mockReturnValue({
      read: async () => messages,
      append: async () => {},
    } as unknown as MessageLog);

    const loaded = await MessageGraph.create();

    expect(loaded.chain('c').map((message) => message._meta.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('returns null when rewind leaves the loaded suffix before hitting a boundary', async () => {
    const messages: AskMessage[] = [
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
    ];

    vi.spyOn(MessageLog, 'create').mockReturnValue({
      read: async () => messages,
      append: async () => {},
    } as unknown as MessageLog);

    const loaded = await MessageGraph.create();

    expect(loaded.resolveRewind('c')).toBeNull();
  });
});
