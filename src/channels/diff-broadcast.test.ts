import { describe, expect, it } from 'vitest';
import { DiffBroadcast, type DiffEvent } from './diff-broadcast.js';

async function take<T>(stream: AsyncIterable<T>, count: number): Promise<T[]> {
  const iterator = stream[Symbol.asyncIterator]();
  const values: T[] = [];

  for (let index = 0; index < count; index += 1) {
    const result = await iterator.next();
    if (result.done) break;
    values.push(result.value);
  }

  return values;
}

function expectEvents<T>(actual: DiffEvent<T>[], expected: DiffEvent<T>[]) {
  expect(actual).toEqual(expected);
}

describe('DiffBroadcast', () => {
  it('replays current values as added events to new subscribers', async () => {
    const broadcast = new DiffBroadcast(['a', 'b']);

    const events = await take(broadcast.channel(), 2);

    expectEvents(events, [{ added: 'a' }, { added: 'b' }]);
  });

  it('emits added and removed events when replacing the snapshot', async () => {
    const broadcast = new DiffBroadcast(['a', 'b']);
    const subscriber = broadcast.channel([]);

    const pending = take(subscriber, 2);
    broadcast.replace(['b', 'c']);

    const events = await pending;

    expectEvents(events, [{ added: 'c' }, { removed: 'a' }]);
  });

  it('supports incremental add and delete operations', async () => {
    const broadcast = new DiffBroadcast<string>();
    const subscriber = broadcast.channel([]);

    const pending = take(subscriber, 2);
    broadcast.add('a');
    broadcast.delete('a');

    const events = await pending;

    expectEvents(events, [{ added: 'a' }, { removed: 'a' }]);
  });

  it('ignores duplicate adds and missing deletes', async () => {
    const broadcast = new DiffBroadcast(['a']);
    const subscriber = broadcast.channel([]);
    const iterator = subscriber[Symbol.asyncIterator]();

    broadcast.add('a');
    broadcast.delete('b');
    const next = iterator.next().then(() => 'resolved');
    await Promise.resolve();

    expect(await Promise.race([next, Promise.resolve('pending')])).toBe(
      'pending',
    );
  });
});
