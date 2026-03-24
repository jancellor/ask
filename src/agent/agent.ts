import { randomUUID } from 'node:crypto';
import { type ModelMessage } from 'ai';
import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { InitPrompt } from './init-prompt.js';
import { AskMessage } from './message-utils.js';
import type { AppendMessageOptions } from './message-graph.js';
import { type MessageNode, MessageGraph } from './message-graph.js';
import { TaskQueue } from './task-queue.js';
import { Turn } from './turn.js';

export type { AskMessage, AskMessageMeta } from './message-utils.js';
export type { MessageNode } from './message-graph.js';

export type AgentOptions = ConfigOptions & {
  resume?: string | true;
};

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  private turn: Turn;
  private sessionId = randomUUID();
  private queue = new TaskQueue();

  private constructor(
    private _tipId: string | null,
    private messageGraph: MessageGraph,
    private config: ResolvedConfig,
  ) {
    this.turn = Turn.fromConfig(config);
  }

  static async create(options: AgentOptions): Promise<Agent> {
    const [messageGraph, config] = await Promise.all([
      MessageGraph.create(),
      new ConfigReader().resolve(options),
    ]);

    const tipId = !options.resume
      ? null
      : typeof options.resume === 'string'
        ? options.resume
        : messageGraph.lastId();

    if (tipId !== null && !messageGraph.has(tipId)) {
      throw new Error(`unknown message ID: ${tipId}`);
    }

    return new Agent(tipId, messageGraph, config);
  }

  get tipId(): string | null {
    return this._tipId;
  }

  messages(): AskMessage[] {
    return this.messageGraph.thread(this._tipId);
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
      const push = async (
        ms: ModelMessage[],
        options: AppendMessageOptions,
      ) => {
        const appended = await this.messageGraph.append(
          this._tipId,
          ms,
          options,
        );
        const last = appended.at(-1);
        if (last) this._tipId = last._meta.id;
        await onMessages?.(appended);
      };

      await this.addInitialMessages(push);
      await push([{ role: 'user', content: prompt }], {});

      return this.turn.ask(
        this.messages(),
        this.sessionId,
        signal,
        async (newMessages, options) => {
          await push(newMessages, options ?? {});
        },
      );
    });
  }

  async abortCurrent(): Promise<void> {
    await this.queue.abortCurrent();
  }

  async abortAll(): Promise<void> {
    await this.queue.abortAll();
  }

  async clear(beforeClear?: () => void): Promise<void> {
    await this.queue.submit(async () => {
      beforeClear?.();
      this._tipId = null;
    }, true);
  }

  async rewind(rewindId: string | null): Promise<void> {
    await this.queue.submit(async () => {
      const resolved = this.messageGraph.resolveRewind(rewindId);
      // null means we walked past the loaded suffix — don't rewind.
      // Use clear() to reset to an empty conversation.
      if (resolved !== null) this._tipId = resolved;
    }, true);
  }

  private async addInitialMessages(
    push: (
      messages: ModelMessage[],
      options: AppendMessageOptions,
    ) => void | Promise<void>,
  ) {
    if (this._tipId !== null) return;
    const initContent = await new InitPrompt().build();
    if (!initContent) return;
    await push([{ role: 'user', content: initContent }], { uiHidden: true });
  }
}
