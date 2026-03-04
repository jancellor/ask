import { randomUUID } from 'node:crypto';
import type { AskMessage } from './messages.js';
import { SessionStore, type SessionStoreOptions } from './session-store.js';
import type { ModelMessage } from 'ai';
import { partition } from 'lodash-es';

export type SessionOptions = SessionStoreOptions;

export type RewindNode = {
  message: AskMessage;
  children: RewindNode[];
};

export class Session {
  private sessionStore: SessionStore;
  private messagesById: Map<string, AskMessage>;
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

  rewind(nextHeadId: string | null): void {
    if (nextHeadId !== null && !this.messagesById.has(nextHeadId)) {
      throw new Error(`unknown message ID: ${nextHeadId}`);
    }
    this.headId = nextHeadId;
  }

  getRewindTree(): RewindNode[] {
    type SortableNode = {
      containsHead: boolean;
      age: number;
      node: RewindNode;
    };
    const compareNodes = (a: SortableNode, b: SortableNode) => {
      const chr = (a.containsHead ? 1 : 0) - (b.containsHead ? 1 : 0);
      if (chr !== 0) return chr;
      return b.age - a.age;
    };
    const sortedInsert = (nodes: SortableNode[], node: SortableNode) => {
      let i = nodes.findIndex((n) => compareNodes(n, node) > 0);
      if (i === -1) i = nodes.length;
      nodes.splice(i, 0, node);
    };

    let nodes: SortableNode[] = [];
    let messageAge = 0;
    for (const message of [...this.messagesById.values()].toReversed()) {
      const id = message._meta.id;

      const [eq, ne] = partition(
        nodes,
        (n) => n.node.message._meta.parentId === id,
      );
      const childNodes = eq;
      nodes = ne;

      const children = childNodes.map((child) => child.node);
      const childrenContHead = childNodes.some((child) => child.containsHead);
      const childrenMinAge = Math.min(...childNodes.map((child) => child.age));
      const containsHead = id === this.headId || childrenContHead;
      const age = Math.min(messageAge++, childrenMinAge);

      const pendingChild = { containsHead, age, node: { message, children } };

      sortedInsert(nodes, pendingChild);
    }

    return nodes.map((child) => child.node);
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
