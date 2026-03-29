import { type ResolvedConfig } from './config.js';
import { type AskMessage } from './message-utils.js';
import { type MessageGraph } from './message-graph.js';
import { Leaf, type LeafEvent } from './leaf.js';
import { Turn } from './turn.js';
import { MulticastAsyncStream } from '../streams/multicast-async-stream.js';

export class PendingTurns {
  private pendingTurns = new Map<string, Turn>();
  private leafEventStream = new MulticastAsyncStream<LeafEvent>();

  create(
    config: ResolvedConfig,
    messageGraph: MessageGraph,
    parentId: string | null,
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Turn {
    const turnId = messageGraph.mintId();
    const turn = Turn.create(
      turnId,
      config,
      messageGraph,
      parentId,
      prompt,
      onMessages,
    );

    this.pendingTurns.set(turnId, turn);
    this.leafEventStream.push({ added: new Leaf(turnId) });
    (async () => {
      try {
        await turn.done;
      } finally {
        this.pendingTurns.delete(turnId);
        this.leafEventStream.push({ removed: new Leaf(turnId) });
      }
    })();

    return turn;
  }

  get(id: string): Turn | null {
    return this.pendingTurns.get(id) ?? null;
  }

  leafEvents(): AsyncIterable<LeafEvent> {
    return this.leafEventStream.stream(
      Array.from(this.pendingTurns.keys(), (id) => ({ added: new Leaf(id) })),
    );
  }
}
