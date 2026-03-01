import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown, colors } from '../render/render.js';

export function UserPartMessage({ text }: { text: string }) {
  const width = Math.max(10, process.stdout.columns ?? 80);
  const divider = '─'.repeat(width);
  const parsed = renderMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text color={colors.muted}>{divider}</Text>
      <Text color={colors.text}>{parsed}</Text>
      <Text color={colors.muted}>{divider}</Text>
      <Text> </Text>
    </Box>
  );
}
