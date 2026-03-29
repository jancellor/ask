import { randomUUID } from 'node:crypto';
import { partition } from 'lodash-es';
import { type AskMessage, isRewindBoundary } from './message-utils.js';
import { MessageLog } from './message-log.js';

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
// But actually we'll probably split into one file per tree in the forest instead.
export class MessageGraph {
  constructor(
    private _lastId: string | null,
    private _leafIds: Set<string>,
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

    const leafIds = new Set(messagesById.keys());
    for (const message of messagesById.values()) {
      if (message._meta.parentId !== null) {
        leafIds.delete(message._meta.parentId);
      }
    }

    return new MessageGraph(lastId, leafIds, messagesById, messageLog);
  }

  get lastId(): string | null {
    return this._lastId;
  }

  get leafIds(): Set<string> {
    return new Set(this._leafIds);
  }

  has(id: string): boolean {
    return this.messagesById.has(id);
  }

  mintId(): string {
    return randomUUID();
  }

  async commit(messages: AskMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const seen = new Set<string>();
    for (const message of messages) {
      const id = message._meta.id;
      if (seen.has(id) || this.messagesById.has(id)) {
        throw new Error(`duplicate message ID: ${id}`);
      }
      seen.add(id);
    }

    const removedLeafId =
      messages[0]!._meta.parentId !== null &&
      this._leafIds.has(messages[0]!._meta.parentId)
        ? messages[0]!._meta.parentId
        : null;

    for (const message of messages) {
      this.messagesById.set(message._meta.id, message);
      this._lastId = message._meta.id;
    }
    if (removedLeafId !== null) {
      this._leafIds.delete(removedLeafId);
    }
    const addedLeafId = messages.at(-1)!._meta.id;
    this._leafIds.add(addedLeafId);
    await this.messageLog.append(messages);
  }

  rewindBoundary(id: string | null): string | null {
    while (id !== null) {
      const message = this.messagesById.get(id);
      if (!message) return null;
      if (isRewindBoundary(message)) break;
      id = message._meta.parentId;
    }
    return id;
  }

  branch(id: string | null, fromId?: string | null): AskMessage[] {
    if (fromId === undefined) return [];

    const branch: AskMessage[] = [];
    const seen = new Set<string>();
    let foundFromId = fromId === null;
    while (id) {
      if (seen.has(id)) {
        // should be enforced already, but inf loop would be horrible
        throw new Error(`cycle detected in message graph at: ${id}`);
      }
      seen.add(id);
      if (id === fromId) {
        foundFromId = true;
        break;
      }
      const message = this.messagesById.get(id);
      if (!message) break;
      branch.push(message);
      id = message._meta.parentId;
    }

    if (!foundFromId) {
      throw new Error(`message ID ${fromId} is not on the requested branch`);
    }
    return branch.reverse();
  }

  forest(): MessageNode[] {
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

  tree(id: string | null): MessageNode | null {
    if (id === null) return null;
    const nodes = this.forest();
    return nodes.find((node) => this.containsMessageId(node, id)) ?? null;
  }

  private containsMessageId(node: MessageNode, id: string): boolean {
    if (node.message._meta.id === id) return true;
    return node.children.some((child) => this.containsMessageId(child, id));
  }
}
