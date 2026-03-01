import React from 'react';
import { Box, Text } from 'ink';
import { ABORTED_MESSAGE, ERROR_MESSAGE } from '../agent/agent.js';
import { renderMarkdown, colors } from '../render/render.js';

export function AssistantPartMessage({
  text,
  dim,
}: {
  text: string;
  dim?: boolean;
}) {
  const isError = [ABORTED_MESSAGE, ERROR_MESSAGE].some((e) =>
    text.startsWith(e),
  );
  const color = isError ? colors.error : dim ? colors.muted : colors.text;
  const parsed = isError || dim ? text : renderMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text color={color}>{parsed}</Text>
      <Text> </Text>
    </Box>
  );
}
