import { type ResolvedConfig } from './config.js';
import { type AskMessage } from './message-utils.js';
import { MessageGraph, type MessageNode } from './message-graph.js';
import { PendingTurn } from './pending-turn.js';
import { Leaf, LeafEvent } from './leaf.js';
import { Broadcast } from '../channels/broadcast.js';
import { HandledPromises } from '../util/handled-promises.js';
import { logError } from '../unawaited/unawaited.js';
import { Turn } from './turn.js';

export class Graph {
  private pendingTurns = new Map<string, PendingTurn>();
  // This class is responsible for lifecycle of PendingTasks, not caller
  private closeTasks = new HandledPromises(() => {}, logError);
  private leafBroadcast = new Broadcast<LeafEvent>();

  private constructor(public messageGraph: MessageGraph) {}

  static async create() {
    const messageGraph = await MessageGraph.create();
    return new Graph(messageGraph);
  }

  async close(): Promise<void> {
    await Promise.all([...this.pendingTurns.values()].map((t) => t.cancel()));
    await this.closeTasks.join();
    this.leafBroadcast.close();
  }

  async ask(
    parentTurnId: string | null,
    prompt: string,
    config: ResolvedConfig,
  ): Promise<Turn> {
    const turnId = this.messageGraph.mintId();
    const baseMessages = this.messageGraph.branch(parentTurnId, null);
    const pendingTurn = PendingTurn.create(
      turnId,
      config,
      baseMessages,
      prompt,
      (messages) => this.messageGraph.commit(messages),
    );
    const task = this.managePendingTurn(pendingTurn);
    this.closeTasks.add(task);
    return pendingTurn;
  }

  async cancel(id: string): Promise<void> {
    await this.pendingTurns.get(id)?.cancel();
  }

  has(id: string): boolean {
    return this.messageGraph.has(id);
  }

  get lastId(): string | null {
    return this.messageGraph.lastId;
  }

  messages(id: string | null, fromId?: string | null): AskMessage[] {
    return this.messageGraph.branch(id, fromId);
  }

  tree(id: string | null): MessageNode | null {
    return this.messageGraph.tree(id);
  }

  rewindBoundary(id: string | null): string | null {
    return this.messageGraph.rewindBoundary(id);
  }

  async *branch(
    id: string | null,
    fromId?: string | null,
  ): AsyncIterable<AskMessage> {
    if (fromId === undefined) return;
    yield* this.messageGraph.branch(id, fromId);
  }

  leafEvents(): AsyncIterable<LeafEvent> {
    return this.leafBroadcast.channel(
      Array.from(this.leafIds, (id) => ({ added: new Leaf(id) })),
    );
  }

  private get leafIds(): Set<string> {
    const leafIds = this.messageGraph.leafIds;
    this.pendingTurns.forEach(({ id }) => leafIds.add(id));
    this.pendingTurns.forEach(({ parentTurnId: p }) => p && leafIds.delete(p));
    return leafIds;
  }

  private async managePendingTurn(pendingTurn: PendingTurn): Promise<void> {
    await this.withLeafDiff(() => {
      this.pendingTurns.set(pendingTurn.id, pendingTurn);
    });
    try {
      await pendingTurn.completeMessages();
    } catch (ignored) {
      // await potential commits, don't handle errors
    }
    await this.withLeafDiff(() => {
      this.pendingTurns.delete(pendingTurn.id);
    });
    await pendingTurn.close();
  }

  private async withLeafDiff(run: () => void | Promise<void>): Promise<void> {
    const before = this.leafIds;
    await run();
    const after = this.leafIds;
    for (const id of after) {
      if (!before.has(id)) {
        this.leafBroadcast.push({ added: new Leaf(id) });
      }
    }
    for (const id of before) {
      if (!after.has(id)) {
        this.leafBroadcast.push({ removed: new Leaf(id) });
      }
    }
  }
}
