import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import { randomUUID } from 'crypto';
import { ConfigReader } from './config.js';
import { InitPrompt } from './init-prompt.js';
import type { AskMessage } from './messages.js';
import { createOpenAISubscriptionFetch } from './openai-subscription-fetch.js';
import { Session } from './session.js';
import { SystemPrompt } from './system-prompt.js';
import { Serializer } from './serializer.js';
import { Tools } from './tools.js';

export type { AskMessage, AskMessageMeta } from './messages.js';

export interface AgentListener {
  onMessages?(messages: AskMessage[]): void | Promise<void>;
  onClear?(): void | Promise<void>;
}

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  readonly modelId: string;
  readonly baseUrl: string;

  private listeners: AgentListener[] = [];
  private languageModel: LanguageModel;
  private systemPrompt: string;
  private tools: Tools;
  private session: Session;
  private serializer = new Serializer();
  private controller: AbortController | null = null;

  private constructor(session: Session) {
    this.session = session;

    const config = new ConfigReader().read();
    this.modelId = config.model;
    this.baseUrl = config.baseUrl;
    const provider = createOpenAICompatible({
      name: 'ask',
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      fetch: createOpenAISubscriptionFetch(),
    });
    this.languageModel = provider(config.model);
    this.systemPrompt = new SystemPrompt().build();
    this.tools = new Tools();
  }

  static async create(options: {
    sessionId?: string;
    continueSession?: boolean;
    fork?: boolean;
  }): Promise<Agent> {
    const session = await Session.create(options);
    return new Agent(session);
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

  ask(message: string): Promise<void> {
    return this.serializer.submit(async () => {
      await this.addInitialMessages();

      await this.addMessages([{ role: 'user', content: message }]);

      this.controller = new AbortController();
      const { signal } = this.controller;

      try {
        while (true) {
          const result = await generateText({
            model: this.languageModel,
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
      this.session = await Session.create({ sessionId: randomUUID() });
      await Promise.all(this.listeners.map((l) => l.onClear?.()));
    });
  }

  private async addMessages(
    newMessages: ModelMessage[],
    uiHidden = false,
  ): Promise<void> {
    const enriched = await this.session.append(newMessages, uiHidden);
    await Promise.all(this.listeners.map((l) => l.onMessages?.(enriched)));
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
