import { randomUUID } from 'node:crypto';
import {
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import { InitPrompt } from './init-prompt.js';
import { generateText } from './generate-text.js';
import { type ResolvedConfig } from './config.js';
import { type AskMessage } from './message-utils.js';
import { Broadcast } from '../channels/broadcast.js';
import { Tools } from './tools.js';
import { SystemPrompt } from './system-prompt.js';
import { Turn } from './turn.js';

type AppendMessageOptions = {
  lastId?: string;
  uiHidden?: boolean;
};

export class PendingTurn implements Turn {
  private systemPrompt = new SystemPrompt().build();
  private tools = new Tools();
  private controller = new AbortController();
  private runPromise: Promise<void>;
  private baseMessages: AskMessage[];
  private newMessages: AskMessage[] = [];
  private messageBroadcast = new Broadcast<AskMessage>();
  private _parentTurnId: string | null;
  private tipId: string | null;
  private _completeMessages: Promise<AskMessage[]>;

  private constructor(
    private turnId: string,
    private config: ResolvedConfig,
    baseMessages: AskMessage[],
    private prompt: string,
    private onComplete: (messages: AskMessage[]) => Promise<void>,
  ) {
    this.baseMessages = [...baseMessages];
    this._parentTurnId = baseMessages.at(-1)?._meta.id ?? null;
    this.tipId = this._parentTurnId;
    this.runPromise = this.run();
    this._completeMessages = this._initCompleteMessages();
  }

  static create(
    turnId: string,
    config: ResolvedConfig,
    baseMessages: AskMessage[],
    prompt: string,
    onComplete: (messages: AskMessage[]) => Promise<void>,
  ): PendingTurn {
    return new PendingTurn(turnId, config, baseMessages, prompt, onComplete);
  }

  async close(): Promise<void> {
    await this.cancel();
    // the point of run() is to funnel all results/error into an iterable
    // but if anything gets missed, it surfaces as a promise rejection
    // therefore we must await it somewhere per structured concurrency
    await this.runPromise;
  }

  async cancel(): Promise<void> {
    this.controller.abort();
    try {
      await this.completeMessages();
    } catch (ignored) {
      // await completion, don't handle errors
    }
  }

  get id(): string {
    return this.turnId;
  }

  get parentTurnId(): string | null {
    return this._parentTurnId;
  }

  messageEvents(): AsyncIterable<AskMessage> {
    return this.messageBroadcast.channel(this.newMessages);
  }

  completeMessages(): Promise<AskMessage[]> {
    return this._completeMessages;
  }

  private async run(): Promise<void> {
    const push = async (ms: ModelMessage[], options: AppendMessageOptions) => {
      const appended = this.withMeta(this.tipId, ms, options);
      this.tipId = appended.at(-1)?._meta.id ?? this.tipId;
      this.newMessages.push(...appended);
      for (const message of appended) {
        this.messageBroadcast.push(message);
      }
    };

    try {
      await this.addInitialMessages(push);
      await push([{ role: 'user', content: this.prompt }], {});

      while (true) {
        const result = await generateText({
          ...this.config.generateOptions,
          sdkProvider: this.config.sdkProvider,
          sessionId: this.fullMessages()[0]?._meta?.id,
          model: this.config.languageModel,
          system: this.systemPrompt,
          messages: this.fullMessages(),
          tools: this.tools.definitions(),
          abortSignal: this.controller.signal,
        });

        if (result.toolCalls.length === 0) {
          await push(result.response.messages, {
            lastId: this.turnId,
          });
          await this.onComplete(this.newMessages);
          return;
        }

        await push(result.response.messages, {});

        const toolResults = await this.callTools(result.toolCalls);

        await push([{ role: 'tool', content: toolResults }], {});
      }
    } catch (error) {
      this.messageBroadcast.fail(error);
    } finally {
      this.messageBroadcast.close();
    }
  }

  private async _initCompleteMessages(): Promise<AskMessage[]> {
    // Array.fromAsync(), ES2025
    const messages = [];
    for await (const message of this.messageEvents()) {
      messages.push(message);
    }
    return messages;
  }

  private fullMessages(): AskMessage[] {
    return [...this.baseMessages, ...this.newMessages];
  }

  private async addInitialMessages(
    push: (
      messages: ModelMessage[],
      options: AppendMessageOptions,
    ) => void | Promise<void>,
  ) {
    if (this.tipId !== null) return;
    const initContent = await new InitPrompt().build();
    if (!initContent) return;
    await push([{ role: 'user', content: initContent }], { uiHidden: true });
  }

  private async callTools(
    toolCalls: Array<TypedToolCall<ToolSet>>,
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
            this.controller.signal,
          ),
        },
      })),
    );
  }

  private withMeta(
    parentId: string | null,
    messages: ModelMessage[],
    options: AppendMessageOptions,
  ): AskMessage[] {
    const timestamp = new Date().toISOString();
    const appended: AskMessage[] = [];

    for (const [index, message] of messages.entries()) {
      const isLast = index === messages.length - 1;
      const id = isLast && options.lastId ? options.lastId : randomUUID();
      appended.push({
        ...message,
        _meta: {
          id,
          timestamp,
          uiHidden: options.uiHidden,
          parentId,
        },
      });
      parentId = id;
    }

    return appended;
  }
}
