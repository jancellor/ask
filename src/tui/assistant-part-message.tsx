import React from 'react';
import { Box, Text } from 'ink';
import { ABORTED_MESSAGE, ERROR_MESSAGE } from '../agent/index.js';
import { parseMarkdown } from './markdown.js';

export function AssistantPartMessage({ text }: { text: string }) {
  const error = [ABORTED_MESSAGE, ERROR_MESSAGE].includes(text);
  const parsed = error ? text : parseMarkdown(text);

  return (
    <Box flexDirection="column">
      <Text color={error ? 'red' : undefined} dimColor={error}>
        {parsed}
      </Text>
      <Text> </Text>
    </Box>
  );
}
