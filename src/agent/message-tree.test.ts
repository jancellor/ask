import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskMessage } from './message-utils.js';
import { MessageGraph } from './message-graph.js';
import { MessageLog } from './message-log.js';

describe('messageTree head selection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns only the tree containing the given head', async () => {
    const messages: AskMessage[] = [
      {
        role: 'user',
        content: 'a',
        _meta: { id: 'a', parentId: null },
      },
      {
        role: 'assistant',
        content: 'b',
        _meta: { id: 'b', parentId: 'a' },
      },
      {
        role: 'user',
        content: 'x',
        _meta: { id: 'x', parentId: null },
      },
      {
        role: 'assistant',
        content: 'y',
        _meta: { id: 'y', parentId: 'x' },
      },
    ];

    vi.spyOn(MessageLog, 'create').mockReturnValue({
      read: async () => messages,
      append: async () => {},
    } as unknown as MessageLog);

    const loaded = await MessageGraph.create();

    expect(loaded.tree('b')?.message._meta.id).toBe('a');
    expect(loaded.tree('y')?.message._meta.id).toBe('x');
  });

  it('returns null when no head is provided', async () => {
    vi.spyOn(MessageLog, 'create').mockReturnValue({
      read: async () => [],
      append: async () => {},
    } as unknown as MessageLog);

    const loaded = await MessageGraph.create();

    expect(loaded.tree(null)).toBeNull();
  });
});
