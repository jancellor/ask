import { Agent, type AgentOptions } from '../agent/agent.js';
import type { AskMessage } from '../agent/messages.js';
import { ShutdownManager } from '../shutdown-manager.js';
import type { TextPart } from 'ai';

type RunBatchOptions = AgentOptions;

export async function runBatch(
  argument: string | undefined,
  options: RunBatchOptions,
): Promise<void> {
  const stdin = !process.stdin.isTTY ? await readStdin() : undefined;
  const message = [stdin, argument].filter(Boolean).join('\n\n');
  if (!message)
    throw new Error('no message provided (pass [message] or pipe stdin)');

  const agent = await Agent.create(options);
  // console.error(`[Session: ${agent.sessionId}]`);

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
          if (part?.type === 'tool-call') {
            const line = formatToolCall(part.toolName, part.input);
            console.error(truncate(line, 80));
          }
        }
      }
    },
  });

  await agent.ask(message);

  // Extract and output the final assistant response
  const response = extractFinalResponse(agent.messages);
  console.log(response);
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) {
    data += String(chunk);
  }
  return data;
}

function formatToolCall(toolName: string, input: unknown): string {
  if (toolName === 'execute') {
    const command = extractCommand(input);
    if (command) {
      return `$ ${command}`;
    }
  }
  // Generic format for other tools
  const inputStr = formatToolInput(input);
  return inputStr ? `${toolName} ${inputStr}` : toolName;
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

function truncate(str: string, maxLen: number): string {
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
      .filter((p): p is TextPart => p?.type === 'text')
      .map((p) => p.text)
      .join('');
  }

  return '';
}
