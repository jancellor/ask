import React from 'react';
import { Box, Text } from 'ink';
import { parseMarkdown } from './markdown.js';

export function UserPartMessage({ text }: { text: string }) {
  const width = Math.max(10, process.stdout.columns ?? 80);
  const divider = '─'.repeat(width);
  const parsed = parseMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text color="gray">{divider}</Text>
      <Text>{parsed}</Text>
      <Text color="gray">{divider}</Text>
      <Text> </Text>
    </Box>
  );
}
