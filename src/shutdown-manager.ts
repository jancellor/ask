import { unawaited } from './unawaited/unawaited.js';

export class ShutdownManager {
  private shutdownPromise: Promise<void> | null = null;
  private listeners: (() => Promise<unknown>)[] = [];

  addListener(listener: () => Promise<unknown>): void {
    this.listeners.push(listener);
  }

  removeListener(listener: () => Promise<unknown>): void {
    const i = this.listeners.lastIndexOf(listener);
    if (i !== -1) this.listeners.splice(i, 1);
  }

  requestShutdown(): void {
    this.shutdown(() => {
      process.exit(0);
    });
  }

  installSignalHandlers(): void {
    for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        this.shutdown(() => {
          // resignal to get proper exit/signal values
          process.kill(process.pid, signal);
        });
      });
    }
  }

  private shutdown(finalize: () => void): void {
    if (!this.shutdownPromise) {
      this.shutdownPromise = (async () => {
        try {
          const listeners = [...this.listeners];
          await Promise.allSettled(listeners.map((listener) => listener()));
        } finally {
          finalize();
        }
      })();
    }
    unawaited(this.shutdownPromise);
  }
}
