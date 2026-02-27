import React from 'react';
import { Box, Text } from 'ink';
import { homedir } from 'os';

interface WelcomeProps {
  model: string;
  provider: string;
  variant: string | null;
}

function shortDir(): string {
  const cwd = process.cwd();
  const home = homedir();
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
}

export function Welcome({ model, provider, variant }: WelcomeProps) {
  const dir = shortDir();

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>
        Ask <Text dimColor>·</Text> {provider} <Text dimColor>·</Text> {model}
        {variant !== null && (
          <>
            {' '}
            <Text dimColor>·</Text> {variant}
          </>
        )}{' '}
        <Text dimColor>·</Text> {dir}
      </Text>
      <Text> </Text>
    </Box>
  );
}
