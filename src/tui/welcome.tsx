import React from 'react';
import { Box, Text } from 'ink';
import { homedir } from 'os';

interface WelcomeProps {
  model: string;
}

function shortDir(): string {
  const cwd = process.cwd();
  const home = homedir();
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
}

export function Welcome({ model }: WelcomeProps) {
  const dir = shortDir();

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text> </Text>
      <Text>
        <Text>┌─┐</Text>
        <Text>{'   '}Gent</Text>
      </Text>
      <Text>
        <Text>┴─┴</Text>
        <Text>{'   '}{model}</Text>
        <Text> · </Text>
        <Text>{dir}</Text>
      </Text>
      <Text> </Text>
    </Box>
  );
}
