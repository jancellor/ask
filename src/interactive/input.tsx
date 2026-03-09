import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useInputState } from './use-input-state.js';
import { useHistory } from './use-history.js';
import { colors } from '../render/render.js';
import { unawaited } from '../unawaited/unawaited.js';

const CLEAR_COMMAND = '/clear';
const CURSOR_BLINK_MS = 600;
const DOUBLE_ESCAPE_MS = 300;

type InputProps = {
  onAsk: (message: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onClear: (beforeClear?: () => void) => Promise<void>;
  onRewind: () => Promise<void>;
  onRequestShutdown: () => void;
  initialValue: string;
};

export function Input({
  onAsk,
  onAbort,
  onClear,
  onRewind,
  onRequestShutdown,
  initialValue,
}: InputProps) {
  const {
    value,
    beforeCursor,
    atCursor,
    afterCursor,
    moveStart,
    moveEnd,
    moveLeft,
    moveRight,
    moveWordLeft,
    moveWordRight,
    deleteBackward,
    deleteToStart,
    deleteToEnd,
    deleteWordBackward,
    insertText,
    clear,
    setValue,
  } = useInputState(initialValue);

  const history = useHistory();
  const [escapePending, setEscapePending] = useState(false);

  const [showCursor, setShowCursor] = useState(true);
  const [keyPulse, setKeyPulse] = useState(0);

  useEffect(() => {
    if (!escapePending) return;
    const timer = setTimeout(() => setEscapePending(false), DOUBLE_ESCAPE_MS);
    return () => clearTimeout(timer);
  }, [escapePending]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      setShowCursor(false);
      intervalId = setInterval(() => {
        setShowCursor((prev) => !prev);
      }, CURSOR_BLINK_MS);
    }, CURSOR_BLINK_MS);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [keyPulse]);

  useInput((input, key) => {
    setShowCursor(true);
    setKeyPulse((pulse) => pulse + 1);

    if (key.escape) {
      if (value === '' && escapePending) {
        setEscapePending(false);
        unawaited(onRewind());
      } else {
        unawaited(onAbort());
        if (value === '') setEscapePending(true);
      }
      return;
    }

    if (key.ctrl && input === 'c') {
      onRequestShutdown();
      return;
    }

    if (key.ctrl && input === 'a') {
      moveStart();
      return;
    }

    if (key.ctrl && input === 'e') {
      moveEnd();
      return;
    }

    if (key.ctrl && input === 'u') {
      deleteToStart();
      return;
    }

    if (key.ctrl && input === 'k') {
      deleteToEnd();
      return;
    }

    if (key.ctrl && input === 'w') {
      deleteWordBackward();
      return;
    }

    if (key.home) {
      moveStart();
      return;
    }

    if (key.end) {
      moveEnd();
      return;
    }

    if (key.upArrow) {
      const next = history.navigateUp(value);
      if (next !== null) {
        setValue(next);
      }
      return;
    }

    if (key.downArrow) {
      const next = history.navigateDown();
      if (next !== null) {
        setValue(next);
      }
      return;
    }

    if (key.leftArrow) {
      if (key.ctrl || key.meta) {
        moveWordLeft();
      } else {
        moveLeft();
      }
      return;
    }

    if (key.rightArrow) {
      if (key.ctrl || key.meta) {
        moveWordRight();
      } else {
        moveRight();
      }
      return;
    }

    if (key.backspace || key.delete) {
      deleteBackward();
      return;
    }

    if (key.return) {
      if (key.meta) {
        insertText('\n');
        return;
      }

      const message = value.trim();
      if (!message) {
        return;
      }

      clear();

      if (message === CLEAR_COMMAND) {
        unawaited(
          onClear(() => {
            console.log('[New session]\n');
          }),
        );
      } else {
        history.onSubmit(message);
        unawaited(onAsk(message));
      }
      return;
    }

    if (!input) {
      return;
    }

    insertText(input);
  });

  const width = Math.max(10, process.stdout.columns ?? 80);
  const divider = '─'.repeat(width);

  return (
    <Box flexDirection="column">
      <Text color={colors.muted}>{divider}</Text>
      <Text color={colors.text}>
        {beforeCursor}
        {showCursor ? <Text inverse>{atCursor}</Text> : atCursor}
        {afterCursor}
      </Text>
      <Text color={colors.muted}>{divider}</Text>
    </Box>
  );
}
