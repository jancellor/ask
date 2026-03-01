import React from 'react';
import { Box, Text } from 'ink';
import { homedir } from 'node:os';
import { colors } from '../render/render.js';

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
      <Text color={colors.text}>
        Ask <Text color={colors.muted}>·</Text> {provider}{' '}
        <Text color={colors.muted}>·</Text> {model}
        {variant !== null && (
          <>
            {' '}
            <Text color={colors.muted}>·</Text> {variant}
          </>
        )}{' '}
        <Text color={colors.muted}>·</Text> {dir}
      </Text>
      <Text> </Text>
    </Box>
  );
}
