import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { type Agent } from '../agent/agent.js';
import { colors } from '../render/render.js';
import {
  REWIND_FILTERS,
  type RewindFilter,
  flattenTree,
} from './rewind-flatten-tree.js';

export type RewindSelection = {
  rewindId: string | null;
  prefillText: string;
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

function truncateToWidth(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return '.'.repeat(maxWidth);
  return text.slice(0, maxWidth - 3) + '...';
}

export function Rewind({ agent, onClose, onSelect }: RewindProps) {
  const [filter, setFilter] = useState<RewindFilter>('user');
  const rows = flattenTree(agent, filter);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>(() =>
    getTerminalSize(),
  );
  const [cursor, setCursor] = useState<number>(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const clamp = (n: number) =>
    rows.length === 0 ? 0 : Math.max(0, Math.min(rows.length - 1, n));

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize(getTerminalSize());
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      setCursor(0);
      setScrollOffset(0);
      return;
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.parentIsTip) {
        setCursor(i);
        setScrollOffset(0);
        return;
      }
    }
    setCursor(rows.length - 1);
    setScrollOffset(0);
  }, [filter, rows.length]);

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
      if (rows.length === 0) return;
      setCursor((c) => clamp(c - 1));
      return;
    }

    if (key.downArrow) {
      if (rows.length === 0) return;
      setCursor((c) => clamp(c + 1));
      return;
    }

    if (key.ctrl || key.meta) return;
    if (_.toLowerCase() === 'f') {
      const i = REWIND_FILTERS.indexOf(filter);
      const next = REWIND_FILTERS[(i + 1) % REWIND_FILTERS.length];
      setFilter(next);
      return;
    }

    if (key.return) {
      const row = rows[cursor];
      if (!row) return;
      onSelect({
        rewindId: row.parentId,
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
        const text = truncateToWidth(row.label, max);

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
        {`↑↓ navigate   enter edit   f filter (${getFilterLabel(filter)})   esc cancel`}
      </Text>
    </Box>
  );
}

function getFilterLabel(filter: RewindFilter): string {
  if (filter === 'user') return 'user';
  return 'user+agent';
}
