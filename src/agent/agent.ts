import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { AskMessage } from './message-utils.js';
import { type MessageNode, MessageGraph } from './message-graph.js';
import { TaskQueue } from './task-queue.js';
import { Turn } from './turn.js';

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
    private messageGraph: MessageGraph,
    private config: ResolvedConfig,
  ) {}

  static async create(options: AgentOptions): Promise<Agent> {
    const [messageGraph, config] = await Promise.all([
      MessageGraph.create(),
      new ConfigReader().resolve(options),
    ]);

    let tipId: string | null = null;

    if (options.resume) {
      const resumeId =
        typeof options.resume === 'string'
          ? options.resume
          : messageGraph.lastId();

      if (resumeId !== null) {
        if (!messageGraph.has(resumeId)) {
          throw new Error(`unknown message ID: ${resumeId}`);
        }
        tipId = resumeId;
      }
    }

    return new Agent(tipId, messageGraph, config);
  }

  get tipId(): string | null {
    return this._tipId;
  }

  messages(): AskMessage[] {
    return this.messageGraph.branch(this._tipId);
  }

  messageTree(): MessageNode | null {
    return this.messageGraph.tree(this._tipId);
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
      const turn = Turn.create(this.config, this.messageGraph, this._tipId);
      signal.addEventListener('abort', () => turn.cancel(), { once: true });

      const turnOnMessages = async (messages: AskMessage[]) => {
        this._tipId = turn.parentId;
        await onMessages?.(messages);
      };

      const result = await turn.ask(prompt, turnOnMessages);
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
      const resolved = this.messageGraph.rewindBoundary(messageId);
      // null means we walked past the loaded suffix — don't rewind.
      // Use clear() to reset to an empty conversation.
      if (resolved !== null) this._tipId = resolved;
    }, true);
  }
}
