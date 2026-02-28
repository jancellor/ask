import { useState } from 'react';

type InputState = {
  value: string;
  cursor: number;
};

export function useInputState() {
  const [state, setState] = useState<InputState>({ value: '', cursor: 0 });
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

      return {
        value: current.value.slice(current.cursor),
        cursor: 0,
      };
    });
  };

  const deleteToEnd = () => {
    setState((current) => {
      if (current.cursor >= current.value.length) {
        return current;
      }

      return {
        ...current,
        value: current.value.slice(0, current.cursor),
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

  const beforeCursor = value.slice(0, cursor);
  const atCursor = value[cursor] ?? ' ';
  const afterCursor = value.slice(Math.min(cursor + 1, value.length));

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
  };
}
