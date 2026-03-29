import { Channel } from './channel.js';

// it may be that some stream-based solution is better than
// this custom mechanism for getting multiple asynciterables from one source
export class Broadcast<T> {
  private channels = new Set<Channel<T>>();
  private closed = false;
  private failure: unknown = undefined;
  private hasFailed = false;

  channel(initial: Iterable<T> = []): Channel<T> {
    let ch!: Channel<T>;
    ch = new Channel<T>(initial, () => this.channels.delete(ch));
    this.channels.add(ch);
    if (this.hasFailed) {
      ch.fail(this.failure);
    } else if (this.closed) {
      ch.close();
    }
    return ch;
  }

  push(value: T): void {
    if (this.closed) return;
    for (const ch of this.channels) {
      ch.push(value);
    }
  }

  fail(error: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.hasFailed = true;
    this.failure = error;
    for (const ch of this.channels) {
      ch.fail(error);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const ch of this.channels) {
      ch.close();
    }
  }
}
