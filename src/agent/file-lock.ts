import { open, stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { ignoreMissing, isEexistError } from './fs-ops.js';

const LOCK_RETRY_MIN_MS = 50;
const LOCK_RETRY_MAX_MS = 100;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 60_000;

export class FileLock {
  constructor(private path: string) {}

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      await ignoreMissing(() => unlink(this.path));
    }
  }

  private async acquire(): Promise<void> {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    for (;;) {
      try {
        const handle = await open(this.path, 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        return;
      } catch (error) {
        if (!isEexistError(error)) throw error;
      }

      await this.removeIfStale();
      await sleep(
        LOCK_RETRY_MIN_MS +
          Math.random() * (LOCK_RETRY_MAX_MS - LOCK_RETRY_MIN_MS),
      );

      if (Date.now() >= deadline) {
        throw new Error(
          `timed out acquiring file lock after ${LOCK_TIMEOUT_MS}ms: ${this.path}`,
        );
      }
    }
  }

  private async removeIfStale(): Promise<void> {
    const lockStat = await ignoreMissing(() => stat(this.path));
    if (lockStat && Date.now() - lockStat.mtimeMs >= LOCK_STALE_MS) {
      await ignoreMissing(() => unlink(this.path));
    }
  }
}
