import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../render/render.js';
import type { ToolPartMessageRenderProps } from './tool-part-message.js';

export function GenericToolPartMessage({
  toolName,
  input,
  output,
}: ToolPartMessageRenderProps) {
  return (
    <Box flexDirection="column">
      {toolName ? (
        <>
          <Text color={colors.text}>{toolName}</Text>
          <Text> </Text>
        </>
      ) : null}
      {input != null ? (
        <>
          <Text color={colors.muted}>{formatGenericToolInput(input)}</Text>
          <Text> </Text>
        </>
      ) : null}
      {output != null ? (
        <>
          <Text color={colors.muted}>{formatGenericToolOutput(output)}</Text>
          <Text> </Text>
        </>
      ) : null}
    </Box>
  );
}

function formatGenericToolInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') return JSON.stringify(input, null, 2);
  return String(input);
}

function formatGenericToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return String(output ?? '');
  const o = output as Record<string, unknown>;

  if ('type' in o && 'value' in o) {
    const value = o.value;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  return JSON.stringify(output, null, 2);
}
