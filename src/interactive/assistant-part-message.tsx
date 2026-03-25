import React from 'react';
import { Box, Text } from 'ink';
import { CANCELED_MESSAGE, ERROR_MESSAGE } from '../agent/agent.js';
import { renderMarkdown, colors } from '../render/render.js';

export function AssistantPartMessage({ text }: { text: string }) {
  const isError = [CANCELED_MESSAGE, ERROR_MESSAGE].some((e) =>
    text.startsWith(e),
  );
  const parsed = isError ? text : renderMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text color={isError ? colors.error : undefined}>{parsed}</Text>
      <Text> </Text>
    </Box>
  );
}
