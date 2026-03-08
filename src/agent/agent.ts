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
import { AskMessage, extractFinalAssistantText } from './messages.js';
import { Session, type MessageNode, type SessionOptions } from './session.js';
import { SystemPrompt } from './system-prompt.js';
import { Serializer } from './serializer.js';
import { Tools } from './tools.js';

export type { AskMessage, AskMessageMeta } from './messages.js';
export type { MessageNode } from './session.js';

export type AgentOptions = SessionOptions & ConfigOptions;

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
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

  ask(
    message: string,
    onMessages?: (messages: AskMessage[]) => void,
  ): Promise<string> {
    return this.serializer.submit(async () => {
      await this.addInitialMessages(onMessages);
      await this.addMessages([{ role: 'user', content: message }], onMessages);

      this.controller = new AbortController();
      const { signal } = this.controller;
      let text: string | null = null;

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

          await this.addMessages(result.response.messages, onMessages);

          if (result.toolCalls.length === 0) {
            text = extractFinalAssistantText(result.response.messages);
            break;
          }

          const toolResults = await this.callTools(result.toolCalls, signal);

          await this.addMessages(
            [{ role: 'tool', content: toolResults }],
            onMessages,
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        text = ERROR_MESSAGE + ': ' + msg;
        await this.addMessages(
          [{ role: 'assistant', content: text }],
          onMessages,
        );
      } finally {
        this.controller = null;
      }

      return text;
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

  getMessageTree(): MessageNode[] {
    return this.session.getMessageTree();
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
    onMessages?: (messages: AskMessage[]) => void,
    uiHidden = false,
  ): Promise<AskMessage[]> {
    const appended = await this.session.append(newMessages, uiHidden);
    onMessages?.(appended);
    return appended;
  }

  private async addInitialMessages(
    onMessages?: (messages: AskMessage[]) => void,
  ) {
    if (this.session.messages.length > 0) return;
    const initContent = await new InitPrompt().build();
    if (!initContent) return;
    await this.addMessages(
      [{ role: 'user', content: initContent }],
      onMessages,
      true,
    );
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
