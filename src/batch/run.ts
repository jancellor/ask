import { Agent, type AgentOptions } from '../agent/agent.js';
import type { AskMessage } from '../agent/messages.js';
import { ShutdownManager } from '../shutdown-manager.js';
import type { TextPart } from 'ai';
import {
  renderMarkdown,
  renderPrompt,
  renderShellScript,
} from '../render/render.js';
import { z } from 'zod';

export const RenderOutput = z.enum(['auto', 'always', 'never']);
export type RenderOutput = z.infer<typeof RenderOutput>;

type RunBatchOptions = {
  message?: string;
  agentOptions: AgentOptions;
  renderOutput: RenderOutput;
};

export async function runBatch(options: RunBatchOptions): Promise<void> {
  const stdin = !process.stdin.isTTY ? await readStdin() : undefined;
  const message = [options.message, stdin].filter(Boolean).join('\n\n');
  if (!message)
    throw new Error('no message provided (pass [message] or pipe stdin)');

  const agent = await Agent.create(options.agentOptions);
  const shouldRenderStdout = shouldRenderOutput(
    options.renderOutput,
    process.stdout.isTTY,
  );
  const shouldRenderStderr = shouldRenderOutput(
    options.renderOutput,
    process.stderr.isTTY,
  );

  const shutdownManager = new ShutdownManager(async () => {
    await agent.cancelAll();
  });
  shutdownManager.installSignalHandlers();

  // Log tool calls to stderr as they happen
  agent.addListener({
    onMessages(newMessages) {
      for (const msg of newMessages) {
        if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
        for (const part of msg.content) {
          if (part.type === 'tool-call') {
            console.error(
              formatToolCall(part.toolName, part.input, 80, shouldRenderStderr),
            );
          }
        }
      }
    },
  });

  await agent.ask(message);

  // Extract and output the final assistant response
  const response = extractFinalResponse(agent.messages);

  // Output: either rendered for the terminal or left as literal text
  const output = shouldRenderStdout ? renderMarkdown(response) : response;
  console.log(output);
}

function shouldRenderOutput(
  renderOutputOption: RenderOutput,
  isTTY: boolean,
): boolean {
  switch (renderOutputOption) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
    default:
      return isTTY;
  }
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) {
    data += String(chunk);
  }
  return data;
}

function formatToolCall(
  toolName: string,
  input: unknown,
  maxLen: number,
  shouldRender: boolean,
): string {
  if (toolName === 'execute') {
    const command = extractCommand(input);
    if (command) {
      return shouldRender
        ? formatExecuteToolCall(command, maxLen)
        : truncateLine(`$ ${command}`, maxLen);
    }
  }
  // Generic format for other tools
  const inputStr = formatToolInput(input);
  const line = inputStr ? `${toolName} ${inputStr}` : toolName;
  return truncateLine(line, maxLen);
}

function extractCommand(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === 'string') return obj.command;
  }
  return null;
}

function formatToolInput(input: unknown): string {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
}

function formatExecuteToolCall(command: string, maxLen: number): string {
  const prefix = '$ ';
  const commandMax = Math.max(0, maxLen - prefix.length);
  const truncated = truncateLine(command, commandMax);
  return renderPrompt(prefix) + renderShellScript(truncated);
}

function truncateLine(str: string, maxLen: number): string {
  const hasMultipleLines = str.includes('\n');
  const firstLine = str.split('\n')[0] ?? '';

  // Needs truncation (either multiple lines or too long)
  const needsTruncation = hasMultipleLines || firstLine.length > maxLen;
  if (!needsTruncation) {
    return firstLine;
  }

  // Always reserve 3 chars for "...", so max content is maxLen - 3
  const contentMax = maxLen - 3;
  const truncated = firstLine.slice(0, contentMax);
  return truncated + '...';
}

function extractFinalResponse(messages: AskMessage[]): string {
  // Find the last non-hidden assistant message
  const assistantMessages = messages.filter(
    (m) => !m._meta?.uiHidden && m.role === 'assistant',
  );

  const lastMessage = assistantMessages.at(-1);
  if (!lastMessage) return '';

  const { content } = lastMessage;

  // Handle string content
  if (typeof content === 'string') {
    return content;
  }

  // Handle array content - extract text parts
  if (Array.isArray(content)) {
    return content
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }

  return '';
}
