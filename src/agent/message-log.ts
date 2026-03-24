import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FileLock } from './file-lock.js';
import { ignoreMissing } from './fs-ops.js';
import type { AskMessage } from './message-utils.js';

export class MessageLog {
  private path: string;
  private lock: FileLock;

  private constructor(private dir: string) {
    this.path = join(dir, 'messages.jsonl');
    this.lock = new FileLock(join(dir, 'messages.jsonl.lock'));
  }

  static create(): MessageLog {
    return new MessageLog(join(homedir(), '.ask', 'messages'));
  }

  async read(): Promise<AskMessage[]> {
    return this.lock.withLock(async () => {
      const content =
        (await ignoreMissing(() => readFile(this.path, 'utf-8'))) ?? '';
      return content
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as AskMessage);
    });
  }

  async append(messages: AskMessage[]): Promise<void> {
    await this.lock.withLock(async () => {
      await mkdir(this.dir, { recursive: true });
      const lines = messages.map((message) => JSON.stringify(message) + '\n');
      await appendFile(this.path, lines.join(''), 'utf-8');
    });
  }
}
