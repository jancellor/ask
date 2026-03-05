import {
  generateText,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import {
  ConfigReader,
  type ConfigOptions,
  type ResolvedConfig,
} from './config.js';
import { InitPrompt } from './init-prompt.js';
import type { AskMessage } from './messages.js';
import { Session, type MessageNode, type SessionOptions } from './session.js';
import { SystemPrompt } from './system-prompt.js';
import { Serializer } from './serializer.js';
import { Tools } from './tools.js';

export type { AskMessage, AskMessageMeta } from './messages.js';
export type { MessageNode } from './session.js';

export interface AgentListener {
  onMessages?(messages: AskMessage[]): void | Promise<void>;
  onClear?(): void | Promise<void>;
  onFork?(): void | Promise<void>;
}

export type AgentOptions = SessionOptions & ConfigOptions;

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  private listeners: AgentListener[] = [];
  private config: ResolvedConfig;
  private systemPrompt: string;
  private tools: Tools;
  private session: Session;
  // consider having SerializedAgent be a wrapper of plain Agent?
  private serializer = new Serializer();
  private controller: AbortController | null = null;

  private constructor(session: Session, config: ResolvedConfig) {
    this.session = session;
    this.config = config;
    this.systemPrompt = new SystemPrompt().build();
    this.tools = new Tools();
  }

  static async create(options: AgentOptions): Promise<Agent> {
    const [session, config] = await Promise.all([
      Session.create(options),
      new ConfigReader().resolve(options),
    ]);
    return new Agent(session, config);
  }

  addListener(listener: AgentListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: AgentListener): void {
    const i = this.listeners.indexOf(listener);
    if (i !== -1) this.listeners.splice(i, 1);
  }

  get messages(): AskMessage[] {
    return this.session.messages;
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  get currentHeadId(): string | null {
    return this.session.currentHeadId;
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

  // accept a callback here rather than use onMessages?
  // replacing onClear and onRewind callbacks should be much simpler
  ask(message: string): Promise<void> {
    return this.serializer.submit(async () => {
      await this.addInitialMessages();

      await this.addMessages([{ role: 'user', content: message }]);

      this.controller = new AbortController();
      const { signal } = this.controller;

      try {
        while (true) {
          const result = await generateText({
            ...this.config.generateOptions,
            model: this.config.languageModel,
            system: this.systemPrompt,
            messages: this.session.messages,
            tools: this.tools.definitions(),
            abortSignal: signal,
          });

          await this.addMessages(result.response.messages);

          if (result.toolCalls.length === 0) break;
          const toolResults = await this.callTools(result.toolCalls, signal);

          await this.addMessages([{ role: 'tool', content: toolResults }]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.addMessages([
          { role: 'assistant', content: ERROR_MESSAGE + ': ' + msg },
        ]);
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
      await Promise.all(this.listeners.map((l) => l.onClear?.()));
    });
  }

  rewind(rewindId: string | null): void {
    this.session.rewind(rewindId);
    void Promise.all(this.listeners.map((l) => l.onMessages?.([])));
  }

  getMessageTree(): MessageNode[] {
    return this.session.getMessageTree();
  }

  async fork(sessionId?: string, beforeFork?: () => void): Promise<void> {
    await this.cancelAll();
    await this.serializer.submit(async () => {
      beforeFork?.();
      await this.session.fork(sessionId);
      await Promise.all(this.listeners.map((l) => l.onFork?.()));
    });
  }

  private async addMessages(
    newMessages: ModelMessage[],
    uiHidden = false,
  ): Promise<void> {
    const appended = await this.session.append(newMessages, uiHidden);
    await Promise.all(this.listeners.map((l) => l.onMessages?.(appended)));
  }

  private async addInitialMessages() {
    if (!this.session.messages.length) {
      const initContent = await new InitPrompt().build();
      if (initContent) {
        await this.addMessages([{ role: 'user', content: initContent }], true);
      }
    }
  }

  private async callTools(
    toolCalls: Array<TypedToolCall<ToolSet>>,
    signal: AbortSignal,
  ): Promise<ToolContent> {
    return await Promise.all(
      toolCalls.map(async (toolCall) => ({
        type: 'tool-result',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: {
          type: 'json',
          value: await this.tools.execute(
            toolCall.toolName,
            toolCall.input,
            signal,
          ),
        },
      })),
    );
  }
}
