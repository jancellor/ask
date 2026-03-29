import { type ResolvedConfig } from './config.js';
import { type AskMessage } from './message-utils.js';
import { MessageGraph } from './message-graph.js';
import { Turn } from './turn.js';
import { PendingTurns } from './pendingTurns.js';
import { Leaf, LeafEvent } from './leaf.js';

export class Graph {
  constructor(
    private pendingTurns: PendingTurns,
    public messageGraph: MessageGraph,
  ) {}

  static async create() {
    const turns = new PendingTurns();
    const messageGraph = await MessageGraph.create();
    return new Graph(turns, messageGraph);
  }

  createTurn(
    config: ResolvedConfig,
    messageGraph: MessageGraph,
    parentId: string | null,
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Turn {
    return this.pendingTurns.create(
      config,
      messageGraph,
      parentId,
      prompt,
      onMessages,
    );
  }

  async *branch(id: string | null): AsyncIterable<AskMessage> {
    const turn = id && this.pendingTurns.get(id);
    if (turn) {
      yield* this.messageGraph.branch(turn.parentId);
      yield* turn.messages();
    } else {
      yield* this.messageGraph.branch(id);
    }
  }

  async *leaves(): AsyncIterable<LeafEvent> {
    this.messageGraph.leaves();
  }
}
