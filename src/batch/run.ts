import { Agent, type AgentOptions } from '../agent/agent.js';
import { getToolCallParts } from '../agent/message-utils.js';
import { ShutdownManager } from '../shutdown-manager.js';
import {
  renderMarkdown,
  renderPrompt,
  renderShellScript,
} from '../render/render.js';
import { z } from 'zod';

export const RenderOutput = z.enum(['auto', 'always', 'never']);
export type RenderOutput = z.infer<typeof RenderOutput>;

type RunBatchOptions = {
  prompt?: string;
  agentOptions: AgentOptions;
  renderOutput: RenderOutput;
};

export async function runBatch(options: RunBatchOptions): Promise<void> {
  const stdin = !process.stdin.isTTY ? await readStdin() : undefined;
  const prompt = [options.prompt, stdin].filter(Boolean).join('\n\n');
  if (!prompt)
    throw new Error('no prompt provided (pass [prompt] or pipe stdin)');

  const agent = await Agent.create(options.agentOptions);
  const shouldRenderStdout = shouldRenderOutput(
    options.renderOutput,
    process.stdout.isTTY,
  );
  const shouldRenderStderr = shouldRenderOutput(
    options.renderOutput,
    process.stderr.isTTY,
  );

  const shutdownManager = new ShutdownManager();
  shutdownManager.installSignalHandlers();
  shutdownManager.addListener(async () => agent.abortAll());

  const response = await agent.ask(prompt, (newMessages) => {
    // should show all intermediate message types, eg assistant text?
    for (const part of getToolCallParts(newMessages)) {
      console.error(
        formatToolCall(part.toolName, part.input, 80, shouldRenderStderr),
      );
    }
  });

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
