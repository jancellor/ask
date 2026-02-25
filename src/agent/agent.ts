import { randomUUID } from 'crypto';
import { appendFile, mkdir, readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
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
  sessionId: string;

  private sessionPath: string;
  private lastMessageId: string | null = null;
  private listeners: AgentListener[] = [];
  private languageModel: LanguageModel;
  private systemPrompt: string;
  private tools: Tools;
  private serializer = new Serializer();
  private controller: AbortController | null = null;

  private constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionPath = this.sessionPathFor(sessionId);

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

  static async create(
    options: { sessionId?: string; continueSession?: boolean } = {},
  ): Promise<Agent> {
    let sessionId = options.sessionId;

    if (!sessionId && options.continueSession) {
      const last = await Agent.lastSessionId();
      if (last === null) throw new Error('no previous session found');
      sessionId = last;
    }

    sessionId = sessionId ?? randomUUID();

    if (!z.uuid().safeParse(sessionId).success) {
      throw new Error(`invalid session ID (expected UUID): ${sessionId}`);
    }

    const agent = new Agent(sessionId);
    if (sessionId) {
      await agent.loadMessages();
    }
    return agent;
  }

  static async lastSessionId(): Promise<string | null> {
    const dir = join(homedir(), '.ask', 'sessions');
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }
    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    let latest: { id: string; mtimeMs: number } | null = null;
    for (const file of jsonlFiles) {
      const s = await stat(join(dir, file));
      if (latest === null || s.mtimeMs > latest.mtimeMs) {
        latest = { id: file.slice(0, -6), mtimeMs: s.mtimeMs };
      }
    }
    return latest?.id ?? null;
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
      this.sessionId = randomUUID();
      this.sessionPath = this.sessionPathFor(this.sessionId);
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

  async cancelAll(): Promise<void> {
    this.abort();
    await this.serializer.cancelPending();
  }

  private sessionPathFor(sessionId: string): string {
    return join(homedir(), '.ask', 'sessions', `${sessionId}.jsonl`);
  }

  private async loadMessages(): Promise<void> {
    let content: string;
    try {
      content = await readFile(this.sessionPath, 'utf-8');
    } catch {
      return;
    }
    const lines = content.trim().split('\n').filter(Boolean);
    this.messages = lines.map((line) => JSON.parse(line) as AskMessage);
    this.lastMessageId = this.messages.at(-1)?._meta?.id ?? null;
  }

  private async persistMessages(messages: AskMessage[]): Promise<void> {
    await mkdir(join(homedir(), '.ask', 'sessions'), { recursive: true });
    for (const message of messages) {
      await appendFile(
        this.sessionPath,
        JSON.stringify(message) + '\n',
        'utf-8',
      );
    }
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
    await this.persistMessages(enriched);
    await Promise.all(this.listeners.map((l) => l.onMessages?.(enriched)));
  }

  private async addInitialMessages() {
    if (!this.messages.length) {
      const initContent = await new InitPrompt().build();
      if (initContent) {
        await this.addMessages([{ role: 'user', content: initContent }], true);
      }
    }
  }
}
