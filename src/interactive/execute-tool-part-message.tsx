import React from 'react';
import { Box, Text } from 'ink';
import { renderPrompt, renderShellScript, colors } from '../render/render.js';
import type { ToolPartMessageRenderProps } from './tool-part-message.js';

export function ExecuteToolPartMessage({
  input,
  output,
}: ToolPartMessageRenderProps) {
  const displayInput = input == null ? null : formatExecuteToolInput(input);
  const parsed = output == null ? null : parseExecuteToolOutput(output);

  return (
    <Box flexDirection="column">
      {displayInput ? (
        <>
          <Text color={colors.text}>{displayInput}</Text>
          <Text> </Text>
        </>
      ) : null}
      {parsed?.stdout ? (
        <>
          <Text color={colors.muted}>{parsed.stdout}</Text>
          <Text> </Text>
        </>
      ) : null}
      {parsed?.stderr ? (
        <>
          <Text color={colors.error}>{parsed.stderr}</Text>
          <Text> </Text>
        </>
      ) : null}
      {parsed?.error ? (
        <>
          <Text color={colors.error}>error: {parsed.error}</Text>
          <Text> </Text>
        </>
      ) : null}
      {parsed?.exit ? (
        <>
          <Text color={colors.muted}>{parsed.exit}</Text>
          <Text> </Text>
        </>
      ) : null}
      {parsed?.signal ? (
        <>
          <Text color={colors.error}>{parsed.signal}</Text>
          <Text> </Text>
        </>
      ) : null}
    </Box>
  );
}

type ParsedExecuteOutput = {
  stdout: string;
  stderr: string;
  error: string;
  exit: string;
  signal: string;
};

function parseExecuteToolOutput(output: unknown): ParsedExecuteOutput | null {
  if (!output || typeof output !== 'object') return null;
  const outer = output as Record<string, unknown>;
  if (outer.type !== 'json' || !('value' in outer)) return null;

  const value = outer.value;
  if (!value || typeof value !== 'object') return null;
  const inner = value as Record<string, unknown>;

  const stdout =
    typeof inner.stdout === 'string' && inner.stdout.trim().length > 0
      ? inner.stdout.trimEnd()
      : '';
  const stderr =
    typeof inner.stderr === 'string' && inner.stderr.trim().length > 0
      ? inner.stderr.trimEnd()
      : '';
  const error =
    typeof inner.error === 'string' && inner.error.trim().length > 0
      ? inner.error.trim()
      : '';
  const exit = inner.exit ?? inner.exitCode;
  const signal = inner.signal;

  return {
    stdout,
    stderr,
    error,
    exit: exit !== undefined ? `exit ${exit}` : '',
    signal: signal ? String(signal) : '',
  };
}

function formatExecuteToolInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === 'string')
      return `${renderPrompt('$ ')}${renderShellScript(obj.command)}`;
    return JSON.stringify(input, null, 2);
  }
  return String(input);
}
