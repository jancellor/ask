import { appendFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Agent, AskMessage } from './agent.js';

function sanitizePathSegment(input: string): string {
  const sanitized = input.replace(/[\\/:]/g, '-');
  return sanitized || 'cwd';
}

export class SessionStore {
  readonly sessionId: string;
  readonly filePath: string;

  private ready: Promise<void>;
  private appendTail: Promise<void> = Promise.resolve();

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID();
    if (!z.uuid().safeParse(this.sessionId).success) {
      throw new Error(`invalid session UUID: ${this.sessionId}`);
    }
    const cwdSegment = sanitizePathSegment(process.cwd());
    const sessionsDir = join(homedir(), '.ask', 'sessions', cwdSegment);
    this.filePath = join(sessionsDir, `${this.sessionId}.jsonl`);
    this.ready = mkdir(sessionsDir, { recursive: true }).then(() => {});
  }

  attach(agent: Agent): () => void {
    return agent.addUpdateListener((newMessages) => {
      this.append(newMessages);
    });
  }

  private append(messages: AskMessage[]): void {
    this.appendTail = this.appendTail
      .then(async () => {
        await this.ready;
        const lines = messages
          .map((message) => JSON.stringify(message) + '\n')
          .join('');
        if (lines) {
          await appendFile(this.filePath, lines, 'utf-8');
        }
      })
      .catch((error: unknown) => {
        console.error('SessionStore append failed:', error);
      });
  }
}
