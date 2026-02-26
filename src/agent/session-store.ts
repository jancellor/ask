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
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AskMessage } from './messages.js';

export interface SessionStoreCreateOptions {
  session?: string;
  continue?: true;
  fork?: true | string;
}

export class SessionStore {
  readonly sessionId: string;
  private sessionPath: string;

  private constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionPath = SessionStore.sessionPathFor(sessionId);
  }

  static async create(
    options: SessionStoreCreateOptions,
  ): Promise<SessionStore> {
    const sourceSessionId = z
      .uuid()
      .parse(
        options.session ??
          (options.continue && (await SessionStore.lastSessionId())) ??
          randomUUID(),
      );
    const source = new SessionStore(sourceSessionId);

    if (!options.fork) return source;
    return source.forked(options.fork === true ? undefined : options.fork);
  }

  static sessionsDir(): string {
    return join(homedir(), '.ask', 'sessions');
  }

  static sessionPathFor(sessionId: string): string {
    return join(SessionStore.sessionsDir(), `${sessionId}.jsonl`);
  }

  static async lastSessionId(): Promise<string | null> {
    const dir = SessionStore.sessionsDir();
    const entries =
      (await SessionStore.ignoreMissing(() => readdir(dir))) ?? [];

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

  private static async ignoreMissing<T>(
    op: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await op();
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  async read(): Promise<AskMessage[]> {
    const content =
      (await SessionStore.ignoreMissing(() =>
        readFile(this.sessionPath, 'utf-8'),
      )) ?? '';
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

  async forked(sessionId?: string): Promise<SessionStore> {
    const resolvedSessionId = z.uuid().parse(sessionId ?? randomUUID());
    const forked = new SessionStore(resolvedSessionId);
    await mkdir(SessionStore.sessionsDir(), { recursive: true });
    await SessionStore.ignoreMissing(() =>
      copyFile(this.sessionPath, forked.sessionPath),
    );
    return forked;
  }
}
