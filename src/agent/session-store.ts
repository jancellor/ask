import { appendFile, mkdir, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Agent, AskMessage } from './agent.js';

export async function lastSessionId(): Promise<string | null> {
  const dir = join(homedir(), '.ask', 'sessions');
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

export class SessionStore {
  readonly sessionId: string;
  readonly filePath: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID();
    if (!z.uuid().safeParse(this.sessionId).success) {
      throw new Error(`invalid session UUID: ${this.sessionId}`);
    }
    this.filePath = join(homedir(), '.ask', 'sessions', `${this.sessionId}.jsonl`);
  }

  attach(agent: Agent): void {
    agent.addListener({
      onMessages: async (messages) => {
        await mkdir(join(homedir(), '.ask', 'sessions'), { recursive: true });
        for (const message of messages) {
          await appendFile(this.filePath, JSON.stringify(message) + '\n', 'utf-8');
        }
      },
    });
  }
}
