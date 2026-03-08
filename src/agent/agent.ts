import { type ModelMessage } from 'ai';
import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { InitPrompt } from './init-prompt.js';
import { AskMessage } from './messages.js';
import { type MessageNode, Session, type SessionOptions } from './session.js';
import { Serializer } from './serializer.js';
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
  private serializer = new Serializer();
  private controller: AbortController | null = null;

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
    return this.serializer.submit(async () => {
      await this.addInitialMessages(onMessages);
      await this.addMessages([{ role: 'user', content: message }], onMessages);

      this.controller = new AbortController();
      const { signal } = this.controller;
      try {
        return await this.turn.ask(
          this.session.messages,
          signal,
          async (newMessages) => {
            await this.addMessages(newMessages, onMessages);
          },
        );
      } finally {
        this.controller = null;
      }
    });
  }

  abort(): void {
    this.controller?.abort();
  }

  async cancelAll(): Promise<void> {
    this.abort();
    await this.serializer.cancelPending();
  }

  async clear(beforeClear?: () => void): Promise<void> {
    await this.cancelAll();
    await this.serializer.submit(async () => {
      beforeClear?.();
      this.session = await this.session.cleared();
    });
  }

  async rewind(rewindId: string | null): Promise<void> {
    this.session.rewind(rewindId);
  }

  async fork(sessionId?: string, beforeFork?: () => void): Promise<void> {
    await this.cancelAll();
    await this.serializer.submit(async () => {
      beforeFork?.();
      await this.session.fork(sessionId);
    });
  }

  private async addMessages(
    newMessages: ModelMessage[],
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
    uiHidden = false,
  ): Promise<AskMessage[]> {
    const appended = await this.session.append(newMessages, uiHidden);
    await onMessages?.(appended);
    return appended;
  }

  private async addInitialMessages(
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ) {
    if (this.session.headId !== null) return;
    const initContent = await new InitPrompt().build();
    if (!initContent) return;
    await this.addMessages(
      [{ role: 'user', content: initContent }],
      onMessages,
      true,
    );
  }
}
