import { AbortError } from './abort-error.js';

export class TaskQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private currentController: AbortController | null = null;

  submit<T>(
    task: (signal: AbortSignal) => Promise<T>,
    cancelAll = false,
  ): Promise<T> {
    if (cancelAll) {
      this.currentController?.abort();
      this.generation++;
    }
    const generation = this.generation;
    return (this.tail = (async () => {
      try {
        await this.tail;
      } catch {}
      if (this.generation !== generation) throw new AbortError();
      this.currentController = new AbortController();
      try {
        return await task(this.currentController.signal);
      } finally {
        this.currentController = null;
      }
    })());
  }

  async cancelCurrent(): Promise<void> {
    this.currentController?.abort();
    try {
      await this.tail;
    } catch {}
  }

  async cancelAll(): Promise<void> {
    this.currentController?.abort();
    this.generation++;
    try {
      await this.tail;
    } catch {}
  }
}
