import { appendFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Agent, AskMessage } from './agent.js';

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
