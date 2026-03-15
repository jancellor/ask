import { type ModelMessage } from 'ai';
import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { InitPrompt } from './init-prompt.js';
import { AskMessage } from './messages.js';
import type { AppendMessageOptions } from './session.js';
import { type MessageNode, Session, type SessionOptions } from './session.js';
import { TaskQueue } from './task-queue.js';
import { Turn } from './turn.js';

export type { AskMessage, AskMessageMeta } from './messages.js';
export type { MessageNode } from './session.js';

export type AgentOptions = SessionOptions & ConfigOptions;

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  private config: ResolvedConfig;
  private turn: Turn;
  private session: Session;
  // consider having SerializedAgent be a wrapper of plain Agent?
  private queue = new TaskQueue();

  private constructor(session: Session, config: ResolvedConfig) {
    this.session = session;
    this.config = config;
    this.turn = Turn.fromConfig(config);
  }

  static async create(options: AgentOptions): Promise<Agent> {
    const [session, config] = await Promise.all([
      Session.create(options),
      new ConfigReader().resolve(options),
    ]);
    return new Agent(session, config);
  }

  get messages(): AskMessage[] {
    return this.session.messages;
  }

  get headId(): string | null {
    return this.session.headId;
  }

  getMessageTree(): MessageNode[] {
    return this.session.getMessageTree();
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
    message: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Promise<string> {
    return this.queue.submit(async (signal) => {
      const push = async (
        ms: ModelMessage[],
        options: AppendMessageOptions,
      ) => {
        const appended = await this.session.append(ms, options);
        await onMessages?.(appended);
      };

      await this.addInitialMessages(push);
      await push([{ role: 'user', content: message }], {});

      return this.turn.ask(
        this.session.messages,
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
      this.session = await this.session.cleared();
    }, true);
  }

  async rewind(rewindId: string | null): Promise<void> {
    await this.queue.submit(async () => {
      this.session.rewind(rewindId);
    }, true);
  }

  async fork(sessionId?: string): Promise<void> {
    await this.queue.submit(async () => {
      await this.session.fork(sessionId);
    }, true);
  }

  private async addInitialMessages(
    push: (
      messages: ModelMessage[],
      options: AppendMessageOptions,
    ) => void | Promise<void>,
  ) {
    if (this.session.headId !== null) return;
    const initContent = await new InitPrompt().build();
    if (!initContent) return;
    await push([{ role: 'user', content: initContent }], { uiHidden: true });
  }
}
