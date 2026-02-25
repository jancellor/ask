import { randomUUID } from 'crypto';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import { ConfigReader } from './config.js';
import { InitPrompt } from './init-prompt.js';
import { createOpenAISubscriptionFetch } from './openai-subscription-fetch.js';
import { SystemPrompt } from './system-prompt.js';
import { Serializer } from './serializer.js';
import { Tools } from './tools.js';

export type AskMessageMeta = {
  id: string;
  parent?: string | null;
  uiHidden?: boolean;
  timestamp?: string;
};
export type AskMessage = ModelMessage & { _meta?: AskMessageMeta };

export interface AgentListener {
  onMessages?(messages: AskMessage[]): void | Promise<void>;
  onClear?(): void | Promise<void>;
}

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  readonly modelId: string;
  readonly baseUrl: string;
  messages: AskMessage[] = [];

  private lastMessageId: string | null = null;
  private listeners: AgentListener[] = [];
  private languageModel: LanguageModel;
  private systemPrompt: string;
  private tools: Tools;
  private serializer = new Serializer();
  private controller: AbortController | null = null;

  constructor() {
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

  private async addMessages(
    newMessages: AskMessage[],
    uiHidden = false,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const enriched = newMessages.map((message, i) => {
      const id = randomUUID();
      const _meta: AskMessageMeta = { id, timestamp, uiHidden };
      if (i === 0 && this.lastMessageId === null) {
        _meta.parent = null;
      }
      return { ...message, _meta };
    });

    if (enriched.length > 0) {
      this.lastMessageId = enriched.at(-1)!._meta!.id;
    }

    this.messages.push(...enriched);
    await Promise.all(this.listeners.map((l) => l.onMessages?.(enriched)));
  }

  addListener(listener: AgentListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: AgentListener): void {
    const i = this.listeners.indexOf(listener);
    if (i !== -1) this.listeners.splice(i, 1);
  }

  abort(): void {
    this.controller?.abort();
  }

  async clear(beforeClear?: () => void): Promise<void> {
    await this.cancelAll();
    await this.serializer.submit(async () => {
      beforeClear?.();
      this.messages = [];
      this.lastMessageId = null;
      await Promise.all(this.listeners.map((l) => l.onClear?.()));
    });
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
            messages: this.messages,
            tools: this.tools.definitions(),
            abortSignal: signal,
          });

          await this.addMessages(result.response.messages as AskMessage[]);

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

  async cancelAll(): Promise<void> {
    this.abort();
    await this.serializer.cancelPending();
  }

  private async addInitialMessages() {
    if (!this.messages.length) {
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
