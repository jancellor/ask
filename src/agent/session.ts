import { randomUUID } from 'node:crypto';
import type { AskMessage } from './messages.js';
import { SessionStore, type SessionStoreOptions } from './session-store.js';
import type { ModelMessage } from 'ai';
import { partition } from 'lodash-es';

export type SessionOptions = SessionStoreOptions;

export type MessageNode = {
  age: number;
  message: AskMessage;
  children: MessageNode[];
};

export class Session {
  private constructor(
    private messagesById: Map<string, AskMessage>,
    private headId: string | null,
    private sessionStore: SessionStore,
  ) {}

  static async create(options: SessionOptions): Promise<Session> {
    const sessionStore = await SessionStore.create(options);

    const messagesById = new Map<string, AskMessage>();
    let headId: string | null = null;
    for (const message of await sessionStore.read()) {
      const id = message._meta.id;
      if (messagesById.has(id)) {
        throw new Error(`duplicate message ID: ${id}`);
      }

      const parentId = message._meta.parentId;
      if (parentId !== null && !messagesById.has(parentId)) {
        throw new Error(
          `message ${id} references unknown or out-of-order parent: ${parentId}`,
        );
      }

      messagesById.set(id, message);
      headId = id;
    }

    return new Session(messagesById, headId, sessionStore);
  }

  get sessionId(): string {
    return this.sessionStore.sessionId;
  }

  get currentHeadId(): string | null {
    return this.headId;
  }

  get messages(): AskMessage[] {
    const messages: AskMessage[] = [];
    let currentId = this.headId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) {
        // invariant should already be enforced, but inf loop would be horrible
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

  rewind(nextHeadId: string | null): void {
    if (nextHeadId !== null && !this.messagesById.has(nextHeadId)) {
      throw new Error(`unknown message ID: ${nextHeadId}`);
    }
    this.headId = nextHeadId;
  }

  getMessageTree(): MessageNode[] {
    const sortedInsert = (nodes: MessageNode[], node: MessageNode) => {
      let i = nodes.findIndex((n) => n.age < node.age);
      if (i === -1) i = nodes.length;
      nodes.splice(i, 0, node);
    };

    let nodes: MessageNode[] = [];
    let messageAge = 0;
    for (const message of [...this.messagesById.values()].toReversed()) {
      const [eq, ne] = partition(
        nodes,
        (n) => n.message._meta.parentId === message._meta.id,
      );
      const children = eq;
      nodes = ne;

      const age = Math.min(messageAge++, ...children.map((child) => child.age));

      sortedInsert(nodes, { age, message, children });
    }

    return nodes;
  }

  private withMeta(messages: ModelMessage[], uiHidden: boolean): AskMessage[] {
    const timestamp = new Date().toISOString();
    const appended: AskMessage[] = [];

    for (const [index, message] of messages.entries()) {
      const id = randomUUID();
      const parent = index === 0 ? this.headId : appended[index - 1]._meta.id;

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
