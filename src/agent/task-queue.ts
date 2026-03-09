import { AbortError } from './abort-error.js';

export class TaskQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private currentController: AbortController | null = null;

  submit<T>(
    task: (signal: AbortSignal) => Promise<T>,
    abortAll = false,
  ): Promise<T> {
    if (abortAll) {
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

  async abortCurrent(): Promise<void> {
    this.currentController?.abort();
    try {
      await this.tail;
    } catch {}
  }

  async abortAll(): Promise<void> {
    this.currentController?.abort();
    this.generation++;
    try {
      await this.tail;
    } catch {}
  }
}
