import React from 'react';
import { Box, Text } from 'ink';
import { ABORTED_MESSAGE, ERROR_MESSAGE } from '../agent/agent.js';
import { parseMarkdown } from './markdown.js';

export function AssistantPartMessage({
  text,
  dim,
}: {
  text: string;
  dim?: boolean;
}) {
  const error = [ABORTED_MESSAGE, ERROR_MESSAGE].some((e) =>
    text.startsWith(e),
  );
  const parsed = error || dim ? text : parseMarkdown(text);
  const color = error ? 'red' : dim ? 'gray' : undefined;

  return (
    <Box flexDirection="column">
      <Text color={color} dimColor={error}>
        {parsed}
      </Text>
      <Text> </Text>
    </Box>
  );
}
