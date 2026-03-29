import { describe, expect, it } from 'vitest';
import { Broadcast } from './broadcast.js';

describe('Broadcast', () => {
  it('awaits close and closes existing subscribers', async () => {
    const broadcast = new Broadcast<string>();
    const iterator = broadcast.channel()[Symbol.asyncIterator]();

    broadcast.close();

    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });

  it('returns already-closed subscribers after close', async () => {
    const broadcast = new Broadcast<string>();

    broadcast.close();

    const iterator = broadcast.channel()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });
});
