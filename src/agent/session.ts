import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AskMessage } from './messages.js';
import { SessionStore } from './session-store.js';
import type { ModelMessage } from 'ai';

export class Session {
  sessionId: string;
  private readonly store: SessionStore;
  private messagesById = new Map<string, AskMessage>();
  private headId: string | null = null;

  private constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.store = new SessionStore(sessionId);
  }

  static async create(options: {
    sessionId?: string;
    continueSession?: boolean;
    fork?: boolean;
  }): Promise<Session> {
    if (options.fork) {
      throw new Error('forking is not yet supported');
    }

    const sessionId =
      options.sessionId ??
      (options.continueSession && (await SessionStore.lastSessionId())) ??
      randomUUID();

    const session = new Session(z.uuid().parse(sessionId));
    await session.load();
    return session;
  }

  get messages(): AskMessage[] {
    const messages: AskMessage[] = [];
    let currentId: string | null = this.headId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) {
        throw new Error(`cycle detected in message graph at: ${currentId}`);
      }
      seen.add(currentId);
      const message = this.messagesById.get(currentId);
      if (!message) throw new Error(`missing message node: ${currentId}`);
      messages.push(message);
      currentId = message._meta.parentId;
    }

    return messages.reverse();
  }

  private async load(): Promise<void> {
    this.messagesById.clear();
    this.headId = null;
    for (const message of await this.store.load()) {
      const id = message._meta.id;
      this.messagesById.set(id, message);
      this.headId = id;
    }
  }

  async append(
    messages: ModelMessage[],
    uiHidden = false,
  ): Promise<AskMessage[]> {
    if (messages.length === 0) return [];

    const appended = this.enrich(messages, uiHidden);
    await this.store.append(appended);
    for (const message of appended) {
      this.messagesById.set(message._meta.id, message);
    }
    const last = appended[appended.length - 1];
    if (last) this.headId = last._meta.id;
    return appended;
  }

  rewind(headId: string | null): void {
    if (headId !== null && !this.messagesById.has(headId)) {
      throw new Error(`unknown message ID: ${headId}`);
    }
    this.headId = headId;
  }

  private enrich(messages: ModelMessage[], uiHidden: boolean): AskMessage[] {
    const timestamp = new Date().toISOString();
    const appended: AskMessage[] = [];
    const initialParent = this.headId;

    for (const [index, message] of messages.entries()) {
      const id = randomUUID();
      const parent = index === 0 ? initialParent : appended[index - 1]._meta.id;

      appended.push({
        ...message,
        _meta: {
          id,
          timestamp,
          uiHidden,
          parentId: parent ?? null,
        },
      });
    }

    return appended;
  }
}
