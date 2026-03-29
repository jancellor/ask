import { AsyncStream } from './async-stream.js';

export class MulticastAsyncStream<T> {
  private streams = new Set<AsyncStream<T>>();

  stream(initial: Iterable<T> = []): AsyncStream<T> {
    let stream!: AsyncStream<T>;
    stream = new AsyncStream<T>(initial, () => this.streams.delete(stream));
    this.streams.add(stream);
    return stream;
  }

  push(value: T): void {
    for (const stream of this.streams) {
      stream.push(value);
    }
  }
}
