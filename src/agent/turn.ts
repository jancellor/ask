import {
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import { InitPrompt } from './init-prompt.js';
import { generateText } from './generate-text.js';
import { type ResolvedConfig } from './config.js';
import { type AskMessage, extractFinalAssistantText } from './message-utils.js';
import { type AppendMessageOptions, MessageGraph } from './message-graph.js';
import { Tools } from './tools.js';
import { SystemPrompt } from './system-prompt.js';

export const ERROR_MESSAGE = '[Error]';

export class Turn {
  private systemPrompt = new SystemPrompt().build();
  private tools = new Tools();
  private controller = new AbortController();
  readonly done: Promise<string>;

  private constructor(
    private turnId: string,
    private config: ResolvedConfig,
    private messageGraph: MessageGraph,
    private _parentId: string | null,
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ) {
    this.done = this.run(prompt, onMessages);
  }

  static create(
    turnId: string,
    config: ResolvedConfig,
    messageGraph: MessageGraph,
    parentId: string | null,
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Turn {
    return new Turn(turnId, config, messageGraph, parentId, prompt, onMessages);
  }

  get parentId(): string | null {
    return this._parentId;
  }

  messages(): AskMessage[] {
    return this.messageGraph.branch(this._parentId);
  }

  private async run(
    prompt: string,
    onMessages?: (messages: AskMessage[]) => void | Promise<void>,
  ): Promise<string> {
    const messages = [...this.messages()];
    const push = async (ms: ModelMessage[], options: AppendMessageOptions) => {
      const appended = await this.messageGraph.append(
        this._parentId,
        ms,
        options,
      );
      this._parentId = appended.at(-1)?._meta.id ?? this._parentId;
      messages.push(...appended);
      await onMessages?.(appended);
    };

    await this.addInitialMessages(push);
    await push([{ role: 'user', content: prompt }], { lastId: this.turnId });

    try {
      while (true) {
        const result = await generateText({
          ...this.config.generateOptions,
          sdkProvider: this.config.sdkProvider,
          sessionId: messages[0]?._meta?.id,
          model: this.config.languageModel,
          system: this.systemPrompt,
          messages,
          tools: this.tools.definitions(),
          abortSignal: this.controller.signal,
        });

        await push(result.response.messages, {});

        if (result.toolCalls.length === 0) {
          return extractFinalAssistantText(result.response.messages);
        }

        const toolResults = await this.callTools(result.toolCalls);

        await push([{ role: 'tool', content: toolResults }], {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const content = ERROR_MESSAGE + ': ' + msg;
      await push([{ role: 'assistant', content }], {});
      return content;
    }
  }

  cancel(): void {
    this.controller.abort();
  }

  private async addInitialMessages(
    push: (
      messages: ModelMessage[],
      options: AppendMessageOptions,
    ) => void | Promise<void>,
  ) {
    if (this._parentId !== null) return;
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
}
