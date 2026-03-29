import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { type AskMessage } from './message-utils.js';
import { type MessageNode } from './message-graph.js';
import { Graph } from './graph.js';
import { Turn } from './turn.js';
import { TaskQueue } from '../util/task-queue.js';
import { promiseWithResolvers } from '../util/promise-with-resolvers.js';

export type { AskMessage, AskMessageMeta } from './message-utils.js';
export type { MessageNode } from './message-graph.js';

export type AgentOptions = ConfigOptions & {
  resume?: string | true;
};

export class Agent {
  private pendingTurn: Turn | null = null;
  private queue = new TaskQueue();

  private constructor(
    private _tipId: string | null,
    private graph: Graph,
    private _config: ResolvedConfig,
  ) {}

  static async create(options: AgentOptions): Promise<Agent> {
    const [graph, config] = await Promise.all([
      Graph.create(),
      new ConfigReader().resolve(options),
    ]);

    let tipId: string | null = null;

    if (options.resume) {
      const resumeId =
        typeof options.resume === 'string' ? options.resume : graph.lastId;

      if (resumeId !== null) {
        if (!graph.has(resumeId)) {
          throw new Error(`unknown message ID: ${resumeId}`);
        }
        tipId = resumeId;
      }
    }

    return new Agent(tipId, graph, config);
  }

  get tipId(): string | null {
    return this._tipId;
  }

  get config(): ResolvedConfig {
    return this._config;
  }

  messages(): AskMessage[] {
    return this.graph.messages(this._tipId, null);
  }

  ask(prompt: string): Promise<Turn> {
    // feels a bit awkward the implementation of this method, refactor welcome
    // key issue is turn must resolve for caller before queue is unblocked
    const { promise, resolve, reject } = promiseWithResolvers<Turn>();
    this.queue
      .submit(async () => {
        const turn = await this.graph.ask(this._tipId, prompt, this._config);
        resolve(turn);
        await this.manageTurn(turn);
      })
      .catch(reject);
    return promise;
  }

  async cancel(): Promise<void> {
    await Promise.all([this.queue.clear(), this.pendingTurn?.cancel()]);
  }

  async rewind(messageId: string | null): Promise<void> {
    await this.cancel();
    const resolved = this.graph.rewindBoundary(messageId);
    if (resolved !== null) {
      this._tipId = resolved;
    }
  }

  async clear(): Promise<void> {
    await this.cancel();
    this._tipId = null;
  }

  async *messageEvents(): AsyncIterable<AskMessage> {
    const turn = this.pendingTurn;
    yield* this.messages();
    if (turn) {
      yield* turn.messageEvents();
    }
  }

  messageTree(): MessageNode | null {
    return this.graph.tree(this._tipId);
  }

  async close(): Promise<void> {
    await this.cancel();
    await this.graph.close();
  }

  private async manageTurn(turn: Turn): Promise<void> {
    this.pendingTurn = turn;
    try {
      await turn.completeMessages();
      this._tipId = turn.id;
    } catch {}
    this.pendingTurn = null;
  }
}
