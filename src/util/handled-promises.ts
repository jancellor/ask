// The point here is to allow structured concurrency in a particular case.
// When a parent class is responsible for the lifecycle of async tasks,
// it can track them and log early but still await them at disposal time.
export class HandledPromises<T> {
  private promises = new Set<Promise<void>>();

  constructor(
    private onFulfilled: (value: T) => void,
    private onRejected: (reason: unknown) => void,
  ) {}

  add(promise: Promise<T>): void {
    let trackedPromise: Promise<void> | null = null;
    const handle = async () => {
      try {
        await promise.then(this.onFulfilled, this.onRejected);
      } finally {
        if (trackedPromise) this.promises.delete(trackedPromise);
      }
    };
    trackedPromise = handle();
    this.promises.add(trackedPromise);
  }

  async join(): Promise<void> {
    await Promise.all(this.promises);
  }
}
