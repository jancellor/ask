import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { type Agent } from '../agent/agent.js';
import { colors } from '../render/render.js';
import { flattenTree } from './rewind-tree.js';

export type RewindSelection = {
  nextHeadId: string | null;
  prefillText?: string;
};

type RewindProps = {
  agent: Agent;
  onClose: () => void;
  onSelect: (selection: RewindSelection) => void;
};

type TerminalSize = {
  columns: number;
  rows: number;
};

function getTerminalSize(): TerminalSize {
  return {
    columns: Math.max(10, process.stdout.columns ?? 80),
    rows: Math.max(1, process.stdout.rows ?? 24),
  };
}

function firstLine(text: string, maxWidth: number): string {
  const line = text.split('\n')[0] ?? '';
  const chars = Array.from(line);
  if (chars.length <= maxWidth) return line;
  if (maxWidth <= 3) return '.'.repeat(maxWidth);
  return chars.slice(0, maxWidth - 3).join('') + '...';
}

export function Rewind({ agent, onClose, onSelect }: RewindProps) {
  const rows = flattenTree(agent);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>(() =>
    getTerminalSize(),
  );
  const [cursor, setCursor] = useState<number>(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.isCurrentHead) return i;
    }
    return Math.max(0, rows.length - 1);
  });
  const [scrollOffset, setScrollOffset] = useState(0);

  const clamp = (n: number) => Math.max(0, Math.min(rows.length - 1, n));

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize(getTerminalSize());
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  const width = terminalSize.columns;
  const divider = '─'.repeat(width);
  const chromeHeight = 3;
  const remainingHeight = terminalSize.rows - chromeHeight;
  const maxVisibleRows = Math.max(1, Math.min(16, remainingHeight));
  const maxScrollOffset = Math.max(0, rows.length - maxVisibleRows);

  useEffect(() => {
    setScrollOffset((currentOffset) => {
      let nextOffset = Math.min(currentOffset, maxScrollOffset);

      if (cursor < nextOffset) {
        nextOffset = cursor;
      } else if (cursor >= nextOffset + maxVisibleRows) {
        nextOffset = cursor - maxVisibleRows + 1;
      }

      return Math.max(0, Math.min(nextOffset, maxScrollOffset));
    });
  }, [cursor, maxScrollOffset, maxVisibleRows]);

  const visibleRows = rows.slice(scrollOffset, scrollOffset + maxVisibleRows);

  useInput((_, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setCursor((c) => clamp(c - 1));
      return;
    }

    if (key.downArrow) {
      setCursor((c) => clamp(c + 1));
      return;
    }

    if (key.return) {
      const row = rows[cursor];
      if (!row) return;
      onSelect({
        nextHeadId: row.nextHeadId,
        prefillText: row.prefillText,
      });
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Text color={colors.muted}>{divider}</Text>
      {visibleRows.map((row, i) => {
        const rowIndex = scrollOffset + i;
        const selected = rowIndex === cursor;
        const prefix = selected ? '> ' : '  ';
        const max = Math.max(1, width - prefix.length - row.treePrefix.length);
        const text = firstLine(row.label, max);

        return (
          <Text key={rowIndex} color={selected ? colors.text : colors.muted}>
            {prefix}
            <Text color={colors.muted}>{row.treePrefix}</Text>
            {text}
          </Text>
        );
      })}
      <Text color={colors.muted}>{divider}</Text>
      <Text color={colors.muted}>
        {'↑↓ navigate   enter select   esc cancel'}
      </Text>
    </Box>
  );
}
