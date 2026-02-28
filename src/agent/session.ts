import { randomUUID } from 'node:crypto';
import type { AskMessage } from './messages.js';
import { SessionStore, type SessionStoreOptions } from './session-store.js';
import type { ModelMessage } from 'ai';

export type SessionOptions = SessionStoreOptions;

export class Session {
  private sessionStore: SessionStore;
  private messagesById;
  private headId: string | null = null;

  private constructor(
    messagesById: Map<string, AskMessage>,
    headId: string | null,
    sessionStore: SessionStore,
  ) {
    this.messagesById = messagesById;
    this.headId = headId;
    this.sessionStore = sessionStore;
  }

  static async create(options: SessionOptions): Promise<Session> {
    const sessionStore = await SessionStore.create(options);

    const messagesById = new Map<string, AskMessage>();
    let headId = null;
    for (const message of await sessionStore.read()) {
      const id = message._meta.id;
      messagesById.set(id, message);
      headId = id;
    }

    return new Session(messagesById, headId, sessionStore);
  }

  get sessionId(): string {
    return this.sessionStore.sessionId;
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

  async append(
    messages: ModelMessage[],
    uiHidden = false,
  ): Promise<AskMessage[]> {
    if (messages.length === 0) return [];

    const appended = this.withMeta(messages, uiHidden);
    await this.sessionStore.append(appended);
    for (const message of appended) {
      this.messagesById.set(message._meta.id, message);
    }
    const last = appended.at(-1);
    if (last) this.headId = last._meta.id;
    return appended;
  }

  async cleared(): Promise<Session> {
    return new Session(
      new Map<string, AskMessage>(),
      null,
      await SessionStore.create({}),
    );
  }

  async fork(sessionId: string | undefined) {
    this.sessionStore = await this.sessionStore.forked(sessionId);
  }

  rewind(headId: string | null): void {
    if (headId !== null && !this.messagesById.has(headId)) {
      throw new Error(`unknown message ID: ${headId}`);
    }
    this.headId = headId;
  }

  private withMeta(messages: ModelMessage[], uiHidden: boolean): AskMessage[] {
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
