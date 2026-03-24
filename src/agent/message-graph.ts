import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { partition } from 'lodash-es';
import { type AskMessage, isRewindBoundary } from './message-utils.js';
import { MessageLog } from './message-log.js';

export type AppendMessageOptions = {
  uiHidden?: boolean;
};

export type MessageNode = {
  age: number;
  message: AskMessage;
  children: MessageNode[];
};

// All methods are designed to work correctly when only a suffix of the full
// message log is loaded — parent pointers may reference messages we don't have.
// Currently we load the entire log into memory on startup, which will degrade
// as the shared log grows. When this becomes a problem, messageLog.read()
// should accept a suffix limit (e.g. last N lines) instead of reading everything.
export class MessageGraph {
  private constructor(
    private _lastId: string | null,
    private messagesById: Map<string, AskMessage>,
    private messageLog: MessageLog,
  ) {}

  static async create(): Promise<MessageGraph> {
    const messageLog = MessageLog.create();

    const messagesById = new Map<string, AskMessage>();
    let lastId: string | null = null;
    for (const message of await messageLog.read()) {
      const id = message._meta.id;
      if (messagesById.has(id)) {
        throw new Error(`duplicate message ID: ${id}`);
      }

      messagesById.set(id, message);
      lastId = id;
    }

    return new MessageGraph(lastId, messagesById, messageLog);
  }

  has(id: string): boolean {
    return this.messagesById.has(id);
  }

  lastId(): string | null {
    return this._lastId;
  }

  thread(tipId: string | null): AskMessage[] {
    const thread: AskMessage[] = [];
    let currentId = tipId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) {
        // should be enforced already, but inf loop would be horrible
        throw new Error(`cycle detected in message graph at: ${currentId}`);
      }
      seen.add(currentId);
      const message = this.messagesById.get(currentId);
      if (!message) break;
      thread.push(message);
      currentId = message._meta.parentId;
    }

    return thread.reverse();
  }

  async append(
    tipId: string | null,
    messages: ModelMessage[],
    options: AppendMessageOptions,
  ): Promise<AskMessage[]> {
    if (messages.length === 0) return []; // prevents unnecessary file creation
    const appended = this.withMeta(tipId, messages, options);
    await this.messageLog.append(appended);
    for (const message of appended) {
      this.messagesById.set(message._meta.id, message);
      this._lastId = message._meta.id;
    }
    return appended;
  }

  resolveRewind(rewindId: string | null): string | null {
    while (rewindId !== null) {
      const message = this.messagesById.get(rewindId);
      if (!message) return null;
      if (isRewindBoundary(message)) break;
      rewindId = message._meta.parentId;
    }
    return rewindId;
  }

  tree(tipId: string | null): MessageNode | null {
    if (tipId === null) return null;

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

    return nodes.find((node) => containsMessageId(node, tipId)) ?? null;
  }

  private withMeta(
    tipId: string | null,
    messages: ModelMessage[],
    options: AppendMessageOptions,
  ): AskMessage[] {
    const timestamp = new Date().toISOString();
    const appended: AskMessage[] = [];

    let parentId = tipId;
    for (const message of messages) {
      const id = randomUUID();
      appended.push({
        ...message,
        _meta: {
          id,
          timestamp,
          uiHidden: options.uiHidden,
          parentId,
        },
      });
      parentId = id;
    }

    return appended;
  }
}

function containsMessageId(node: MessageNode, messageId: string): boolean {
  if (node.message._meta.id === messageId) return true;
  return node.children.some((child) => containsMessageId(child, messageId));
}
