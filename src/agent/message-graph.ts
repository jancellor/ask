import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { partition } from 'lodash-es';
import { type AskMessage, isRewindBoundary } from './message-utils.js';
import { MessageLog } from './message-log.js';
import { Leaf, type LeafEvent } from './leaf.js';
import { MulticastAsyncStream } from '../streams/multicast-async-stream.js';

export type AppendMessageOptions = {
  lastId?: string;
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
  private leafEventStream = new MulticastAsyncStream<LeafEvent>();

  private constructor(
    private _lastId: string | null,
    private messagesById: Map<string, AskMessage>,
    private leafIds: Set<string>,
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

    return new MessageGraph(lastId, messagesById, leafIds, messageLog);
  }

  has(id: string): boolean {
    return this.messagesById.has(id);
  }

  lastId(): string | null {
    return this._lastId;
  }

  mintId(): string {
    return randomUUID();
  }

  async append(
    parentId: string | null,
    messages: ModelMessage[],
    options: AppendMessageOptions,
  ): Promise<AskMessage[]> {
    if (messages.length === 0) return []; // prevents unnecessary file creation
    const removedLeafId =
      parentId !== null && this.leafIds.has(parentId) ? parentId : null;
    const appended = this.withMeta(parentId, messages, options);
    await this.messageLog.append(appended);
    for (const message of appended) {
      this.messagesById.set(message._meta.id, message);
      this._lastId = message._meta.id;
    }
    if (removedLeafId !== null) {
      this.leafIds.delete(removedLeafId);
      this.leafEventStream.push({ removed: new Leaf(removedLeafId) });
    }
    const addedLeafId = appended.at(-1)!._meta.id;
    this.leafIds.add(addedLeafId);
    this.leafEventStream.push({ added: new Leaf(addedLeafId) });
    return appended;
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

  branch(id: string | null): AskMessage[] {
    const branch: AskMessage[] = [];
    let currentId = id;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) {
        // should be enforced already, but inf loop would be horrible
        throw new Error(`cycle detected in message graph at: ${currentId}`);
      }
      seen.add(currentId);
      const message = this.messagesById.get(currentId);
      if (!message) break;
      branch.push(message);
      currentId = message._meta.parentId;
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

  leaves(): Leaf[] {
    return Array.from(this.leafIds, (id) => new Leaf(id));
  }

  leafEvents(): AsyncIterable<LeafEvent> {
    return this.leafEventStream.stream(
      this.leaves().map((leaf) => ({ added: leaf })),
    );
  }

  private withMeta(
    parentId: string | null,
    messages: ModelMessage[],
    options: AppendMessageOptions,
  ): AskMessage[] {
    const timestamp = new Date().toISOString();
    const appended: AskMessage[] = [];

    for (const [index, message] of messages.entries()) {
      const isLast = index === messages.length - 1;
      const id = isLast && options.lastId ? options.lastId : this.mintId();
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

  private containsMessageId(node: MessageNode, id: string): boolean {
    if (node.message._meta.id === id) return true;
    return node.children.some((child) => this.containsMessageId(child, id));
  }
}
