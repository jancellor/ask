import React from 'react';
import { Box, Text } from 'ink';
import { homedir } from 'os';

interface WelcomeProps {
  model: string;
  provider: string;
}

function shortDir(): string {
  const cwd = process.cwd();
  const home = homedir();
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
}

export function Welcome({ model, provider }: WelcomeProps) {
  const dir = shortDir();

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text> </Text>
      <Text>
        <Text>Ask</Text>
        <Text dimColor> · </Text>
        <Text>{dir}</Text>
      </Text>
      <Text>
        <Text>{provider}</Text>
        <Text dimColor> · </Text>
        <Text>{model}</Text>
      </Text>
      <Text> </Text>
    </Box>
  );
}
