import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../render/render.js';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function SpinnerMessage() {
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((idx) => (idx + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column">
      <Text color={colors.text}>{frames[frameIndex]}</Text>
      <Text> </Text>
    </Box>
  );
}
