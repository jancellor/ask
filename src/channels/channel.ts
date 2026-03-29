export class Channel<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private values: T[] = [];
  private resolveNext: ((result: IteratorResult<T>) => void) | null = null;
  private rejectNext: ((error: unknown) => void) | null = null;
  private closed = false;
  private failure: unknown = undefined;
  private hasFailed = false;

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

    if (this.hasFailed) {
      return Promise.reject(this.failure);
    }

    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.resolveNext = resolve;
      this.rejectNext = reject;
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  push(value: T): void {
    if (this.closed) return;

    if (this.resolveNext) {
      this.resolveNext({ value, done: false });
      this.resolveNext = null;
      this.rejectNext = null;
      return;
    }

    this.values.push(value);
  }

  fail(error: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.hasFailed = true;
    this.failure = error;
    this.onClose();
    if (this.rejectNext) {
      this.rejectNext(error);
      this.resolveNext = null;
      this.rejectNext = null;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
    if (this.resolveNext) {
      this.resolveNext({ value: undefined, done: true });
      this.resolveNext = null;
      this.rejectNext = null;
    }
  }
}
