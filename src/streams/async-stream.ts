export class AsyncStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private values: T[] = [];
  private resolveNext: ((result: IteratorResult<T>) => void) | null = null;
  private finished = false;

  constructor(
    initial: Iterable<T> = [],
    private onClose: () => void,
  ) {
    for (const value of initial) {
      this.values.push(value);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      const value = this.values.shift()!;
      return Promise.resolve({ value, done: false });
    }

    if (this.finished) {
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise<IteratorResult<T>>((resolve) => {
      this.resolveNext = resolve;
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.finish();
    return Promise.resolve({ value: undefined, done: true });
  }

  push(value: T): void {
    if (this.finished) return;

    if (this.resolveNext) {
      this.resolveNext({ value, done: false });
      this.resolveNext = null;
      return;
    }

    this.values.push(value);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onClose();

    if (this.resolveNext) {
      this.resolveNext({ value: undefined, done: true });
      this.resolveNext = null;
    }
  }
}
