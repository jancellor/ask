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
    <Box flexDirection="column">
      <Text> </Text>
      <Text>Ask <Text dimColor>·</Text> {provider} <Text dimColor>·</Text> {model} <Text dimColor>·</Text> {dir}</Text>
      <Text> </Text>
    </Box>
  );
}
