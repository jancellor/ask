import { Broadcast } from './broadcast.js';

export type DiffEvent<T> = { added: T } | { removed: T };

export class DiffBroadcast<T> {
  private values = new Set<T>();
  private eventBroadcast = new Broadcast<DiffEvent<T>>();
  private closed = false;

  constructor(initial: Iterable<T> = []) {
    for (const value of initial) {
      this.values.add(value);
    }
  }

  channel(initial: Iterable<DiffEvent<T>> = this.initialEvents()) {
    return this.eventBroadcast.channel(initial);
  }

  replace(next: Iterable<T>): void {
    if (this.closed) return;

    const nextValues = new Set(next);

    for (const value of nextValues) {
      if (!this.values.has(value)) {
        this.eventBroadcast.push({ added: value });
      }
    }

    for (const value of this.values) {
      if (!nextValues.has(value)) {
        this.eventBroadcast.push({ removed: value });
      }
    }

    this.values = nextValues;
  }

  add(value: T): void {
    if (this.closed || this.values.has(value)) return;
    this.values.add(value);
    this.eventBroadcast.push({ added: value });
  }

  delete(value: T): void {
    if (this.closed || !this.values.has(value)) return;
    this.values.delete(value);
    this.eventBroadcast.push({ removed: value });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.eventBroadcast.close();
  }

  private initialEvents(): DiffEvent<T>[] {
    return Array.from(this.values, (value) => ({ added: value }));
  }
}
