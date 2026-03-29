import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { AskMessage } from './message-utils.js';
import { type MessageNode, MessageGraph } from './message-graph.js';
import { TaskQueue } from './task-queue.js';
import { type Turn } from './turn.js';
import { Graph } from './graph.js';

export type { AskMessage, AskMessageMeta } from './message-utils.js';
export type { MessageNode } from './message-graph.js';

export type AgentOptions = ConfigOptions & {
  resume?: string | true;
};

export const CANCELED_MESSAGE = '[Canceled]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  private queue = new TaskQueue();

  private constructor(
    private _tipId: string | null,
    private graph: Graph,
    private config: ResolvedConfig,
  ) {}

  static async create(options: AgentOptions): Promise<Agent> {
    const [graph, config] = await Promise.all([
      Graph.create(),
      new ConfigReader().resolve(options),
    ]);

    let tipId: string | null = null;

    if (options.resume) {
      const resumeId =
        typeof options.resume === 'string'
          ? options.resume
          : graph.messageGraph.lastId();

      if (resumeId !== null) {
        if (!graph.messageGraph.has(resumeId)) {
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

  messages(): AskMessage[] {
    return this.graph.messageGraph.branch(this._tipId);
  }

  branch(): AsyncIterable<AskMessage> {
    return this.graph.branch(this._tipId);
  }

  messageTree(): MessageNode | null {
    return this.graph.messageGraph.tree(this._tipId);
  }

  get model(): string {
    return this.config.model;
  }

  get provider(): string {
    return this.config.provider;
  }

  get variant(): string | null {
    return this.config.variant;
  }

  ask(
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Promise<string> {
    return this.queue.submit(async (signal) => {
      let turn: Turn;
      const turnOnMessages = async (messages: AskMessage[]) => {
        this._tipId = turn.parentId;
        await onMessages?.(messages);
      };

      turn = this.graph.createTurn(
        this.config,
        this.graph.messageGraph,
        this._tipId,
        prompt,
        turnOnMessages,
      );
      if (signal.aborted) {
        turn.cancel();
      } else {
        signal.addEventListener('abort', () => turn.cancel(), { once: true });
      }

      const result = await turn.done;
      this._tipId = turn.parentId;
      return result;
    });
  }

  async cancelCurrent(): Promise<void> {
    await this.queue.cancelCurrent();
  }

  async cancelAll(): Promise<void> {
    await this.queue.cancelAll();
  }

  async clear(beforeClear?: () => void): Promise<void> {
    await this.queue.submit(async () => {
      beforeClear?.();
      this._tipId = null;
    }, true);
  }

  async rewind(messageId: string | null): Promise<void> {
    await this.queue.submit(async () => {
      const resolved = this.graph.messageGraph.rewindBoundary(messageId);
      // null means we walked past the loaded suffix — don't rewind.
      // Use clear() to reset to an empty conversation.
      if (resolved !== null) this._tipId = resolved;
    }, true);
  }
}
