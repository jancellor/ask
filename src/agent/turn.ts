import {
  generateText,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
  type TypedToolCall,
} from 'ai';
import {
  type ConfigOptions,
  ConfigReader,
  type ResolvedConfig,
} from './config.js';
import { extractFinalAssistantText, extractText } from './messages.js';
import { Tools } from './tools.js';
import { SystemPrompt } from './system-prompt.js';

export type { AskMessage, AskMessageMeta } from './messages.js';
export type { MessageNode } from './session.js';

export const ERROR_MESSAGE = '[Error]';

export class Turn {
  private config: ResolvedConfig;
  private systemPrompt: string;
  private tools: Tools;

  private constructor(config: ResolvedConfig) {
    this.config = config;
    this.systemPrompt = new SystemPrompt().build();
    this.tools = new Tools();
  }

  static fromConfig(config: ResolvedConfig): Turn {
    return new Turn(config);
  }

  async ask(
    initialMessages: ModelMessage[],
    signal: AbortSignal,
    onMessages: (messages: ModelMessage[]) => void | Promise<void>,
  ): Promise<string> {
    const messages = [...initialMessages];
    const push = async (m: ModelMessage[]) => {
      messages.push(...m);
      await onMessages(m);
    };

    try {
      while (true) {
        const result = await generateText({
          ...this.config.generateOptions,
          model: this.config.languageModel,
          system: this.systemPrompt,
          messages,
          tools: this.tools.definitions(),
          abortSignal: signal,
        });

        await push(result.response.messages);

        if (result.toolCalls.length === 0) {
          return extractFinalAssistantText(result.response.messages);
        }

        const toolResults = await this.callTools(result.toolCalls, signal);

        await push([{ role: 'tool', content: toolResults }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const content = ERROR_MESSAGE + ': ' + msg;
      await push([{ role: 'assistant', content }]);
      return content;
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
