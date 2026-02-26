import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
} from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { AskMessage } from './messages.js';

export class SessionStore {
  private readonly sessionPath: string;

  constructor(sessionId: string) {
    this.sessionPath = SessionStore.sessionPathFor(sessionId);
  }

  static sessionsDir(): string {
    return join(homedir(), '.ask', 'sessions');
  }

  static sessionPathFor(sessionId: string): string {
    return join(SessionStore.sessionsDir(), `${sessionId}.jsonl`);
  }

  static async fork(fromSessionId: string, toSessionId: string): Promise<void> {
    await mkdir(SessionStore.sessionsDir(), { recursive: true });
    await copyFile(
      SessionStore.sessionPathFor(fromSessionId),
      SessionStore.sessionPathFor(toSessionId),
    );
  }

  async load(): Promise<AskMessage[]> {
    const content = await readFile(this.sessionPath, 'utf-8').catch(
      (error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return '';
        }
        throw error;
      },
    );
    return content
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AskMessage);
  }

  async append(messages: AskMessage[]): Promise<void> {
    await mkdir(SessionStore.sessionsDir(), { recursive: true });
    const lines = messages.map((message) => JSON.stringify(message) + '\n');
    await appendFile(this.sessionPath, lines.join(''), 'utf-8');
  }

  static async lastSessionId(): Promise<string | null> {
    const dir = SessionStore.sessionsDir();
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }

    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    let latest: { id: string; mtimeMs: number } | null = null;
    for (const file of jsonlFiles) {
      const s = await stat(join(dir, file));
      if (latest === null || s.mtimeMs > latest.mtimeMs) {
        latest = { id: file.slice(0, -6), mtimeMs: s.mtimeMs };
      }
    }
    return latest?.id ?? null;
  }
}
