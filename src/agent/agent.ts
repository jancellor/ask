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
import { SystemPrompt } from './system-prompt.js';
import { Serializer } from './serializer.js';
import { Tools } from './tools.js';

export type GentMessage = ModelMessage & { _meta?: { uiHidden?: boolean } };

export const ABORTED_MESSAGE = '[Aborted]';
export const ERROR_MESSAGE = '[Error]';

export class Agent {
  messages: GentMessage[] = [];
  readonly modelId: string;

  private updateListeners = new Set<
    (newMessages: GentMessage[], allMessages: GentMessage[]) => void
  >();
  private languageModel: LanguageModel;
  private systemPrompt: string;
  private tools: Tools;
  private serializer = new Serializer();
  private controller: AbortController | null = null;

  constructor() {
    const config = new ConfigReader().read();
    this.modelId = config.model;
    const provider = createOpenAICompatible({
      name: 'gent',
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.languageModel = provider(config.model);
    this.systemPrompt = new SystemPrompt().build();
    this.tools = new Tools();
  }

  private addMessages(newMessages: GentMessage[]): void {
    this.messages.push(...newMessages);
    this.updateListeners.forEach((listener) =>
      listener(newMessages, this.messages),
    );
  }

  addUpdateListener(
    listener: (newMessages: GentMessage[], allMessages: GentMessage[]) => void,
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

          this.addMessages(result.response.messages as GentMessage[]);

          if (result.toolCalls.length === 0) break;
          const toolResults = await this.callTools(result.toolCalls, signal);

          this.addMessages([{ role: 'tool', content: toolResults }]);
        }
      } catch (e) {
        this.addMessages([{ role: 'assistant', content: ERROR_MESSAGE }]);
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
