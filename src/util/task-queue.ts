import { AbortError } from '../agent/abort-error.js';

export class TaskQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;

  submit<T>(task: () => T | Promise<T>): Promise<T> {
    const gen = this.generation;
    return (this.tail = (async () => {
      try {
        await this.tail;
      } catch {}
      if (this.generation !== gen) throw new AbortError();
      return task();
    })());
  }

  async clear(): Promise<void> {
    this.generation++;
    try {
      await this.tail;
    } catch {}
  }
}
