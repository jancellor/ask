export class Serializer {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;

  async submit<T>(task: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    return (this.tail = (async () => {
      try {
        await this.tail;
      } catch (ignored) {}
      if (this.generation === generation) {
        return await task();
      }
      throw new Error('aborted');
    })());
  }

  async cancelPending(): Promise<void> {
    this.generation += 1;
    try {
      await this.tail;
    } catch (ignored) {}
  }
}
