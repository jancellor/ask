import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../render/render.js';

export function AssistantPartMessage({ text }: { text: string }) {
  const parsed = renderMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text>{parsed}</Text>
      <Text> </Text>
    </Box>
  );
}
