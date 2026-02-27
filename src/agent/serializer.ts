export class Serializer {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;

  async submit(task: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    return (this.tail = (async () => {
      try {
        await this.tail;
      } catch (ignored) {}
      if (this.generation === generation) {
        await task();
      }
    })());
  }

  async cancelPending(): Promise<void> {
    this.generation += 1;
    try {
      await this.tail;
    } catch (ignored) {}
  }
}
