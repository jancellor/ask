import { useState } from 'react';

type InputState = {
  value: string;
  cursor: number;
};

export function useInputState(initialValue: string) {
  const [state, setState] = useState<InputState>({
    value: initialValue,
    cursor: initialValue.length,
  });
  const { value, cursor } = state;

  const getWordCursor = (
    value: string,
    cursor: number,
    backwards: boolean,
  ): number => {
    const len = value.length;
    const step = backwards ? -1 : 1;
    let i = Math.max(0, Math.min(cursor + Math.min(step, 0), len));
    const isSpace = (index: number) => /\s/.test(value[index] ?? ' ');
    const shouldMove = (offset: number, moveOnSpace: boolean) =>
      isSpace(i + offset) === moveOnSpace;
    const firstOffset = 0;
    const secondOffset = step < 0 ? -1 : 0;
    const firstMoveOnSpace = step < 0;
    const secondMoveOnSpace = !firstMoveOnSpace;

    while (i > 0 && i < len && shouldMove(firstOffset, firstMoveOnSpace)) {
      i += step;
    }

    while (i > 0 && i < len && shouldMove(secondOffset, secondMoveOnSpace)) {
      i += step;
    }

    return i;
  };

  const moveStart = () => {
    setState((current) => ({ ...current, cursor: 0 }));
  };

  const moveEnd = () => {
    setState((current) => ({ ...current, cursor: current.value.length }));
  };

  const moveLeft = () => {
    setState((current) => ({
      ...current,
      cursor: Math.max(0, current.cursor - 1),
    }));
  };

  const moveRight = () => {
    setState((current) => ({
      ...current,
      cursor: Math.min(current.value.length, current.cursor + 1),
    }));
  };

  const moveWordLeft = () => {
    setState((current) => ({
      ...current,
      cursor: getWordCursor(current.value, current.cursor, true),
    }));
  };

  const moveWordRight = () => {
    setState((current) => ({
      ...current,
      cursor: getWordCursor(current.value, current.cursor, false),
    }));
  };

  const deleteBackward = () => {
    setState((current) => {
      if (current.cursor === 0) {
        return current;
      }

      return {
        value:
          current.value.slice(0, current.cursor - 1) +
          current.value.slice(current.cursor),
        cursor: current.cursor - 1,
      };
    });
  };

  const deleteToStart = () => {
    setState((current) => {
      if (current.cursor === 0) {
        return current;
      }

      const previousNewline = current.value.lastIndexOf(
        '\n',
        current.cursor - 1,
      );
      const nextCursor = previousNewline === -1 ? 0 : previousNewline;

      return {
        value:
          current.value.slice(0, nextCursor) +
          current.value.slice(current.cursor),
        cursor: nextCursor,
      };
    });
  };

  const deleteToEnd = () => {
    setState((current) => {
      if (current.cursor >= current.value.length) {
        return current;
      }

      const nextNewline = current.value.indexOf('\n', current.cursor);
      const nextCursor =
        nextNewline === -1 ? current.value.length : nextNewline + 1;

      return {
        ...current,
        value:
          current.value.slice(0, current.cursor) +
          current.value.slice(nextCursor),
      };
    });
  };

  const deleteWordBackward = () => {
    setState((current) => {
      if (current.cursor === 0) {
        return current;
      }

      const nextCursor = getWordCursor(current.value, current.cursor, true);
      return {
        value:
          current.value.slice(0, nextCursor) +
          current.value.slice(current.cursor),
        cursor: nextCursor,
      };
    });
  };

  const insertText = (text: string) => {
    if (!text) {
      return;
    }

    setState((current) => ({
      value:
        current.value.slice(0, current.cursor) +
        text +
        current.value.slice(current.cursor),
      cursor: current.cursor + text.length,
    }));
  };

  const clear = () => {
    setState({ value: '', cursor: 0 });
  };

  const setValue = (text: string) => {
    setState({ value: text, cursor: text.length });
  };

  const beforeCursor = value.slice(0, cursor);
  const currentChar = value[cursor];
  const atCursor = currentChar === '\n' ? ' ' : (currentChar ?? ' ');
  const afterCursor =
    currentChar === '\n'
      ? value.slice(cursor)
      : value.slice(Math.min(cursor + 1, value.length));

  return {
    value,
    cursor,
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
  };
}
