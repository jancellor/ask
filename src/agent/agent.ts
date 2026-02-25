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

export type AskMessageMeta = { uiHidden?: boolean; timestamp?: string };
export type AskMessage = ModelMessage & { _meta?: AskMessageMeta };

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  messages: AskMessage[] = [];
  readonly modelId: string;
  readonly baseUrl: string;

  private updateListeners = new Set<
    (newMessages: AskMessage[], allMessages: AskMessage[]) => void
  >();
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

  private addMessages(newMessages: AskMessage[]): void {
    const timestamp = new Date().toISOString();
    const normalizedMessages = newMessages.map((message) => ({
      ...message,
      _meta: { ...message._meta, timestamp },
    }));

    this.messages.push(...normalizedMessages);
    this.updateListeners.forEach((listener) =>
      listener(normalizedMessages, this.messages),
    );
  }

  addUpdateListener(
    listener: (newMessages: AskMessage[], allMessages: AskMessage[]) => void,
  ): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  abort(): void {
    this.controller?.abort();
  }

  async clear(beforeClear?: () => void): Promise<void> {
    await this.cancelAll();
    await this.serializer.submit(async () => {
      beforeClear?.();
      this.messages = [];
      this.addMessages([]);
    });
  }

  sendMessage(message: string): Promise<void> {
    return this.serializer.submit(async () => {
      await this.addInitialMessages();

      this.addMessages([{ role: 'user', content: message }]);

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

          this.addMessages(result.response.messages as AskMessage[]);

          if (result.toolCalls.length === 0) break;
          const toolResults = await this.callTools(result.toolCalls, signal);

          this.addMessages([{ role: 'tool', content: toolResults }]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.addMessages([
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
        this.addMessages([
          { role: 'user', content: initContent, _meta: { uiHidden: true } },
        ]);
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
