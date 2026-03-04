import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { type Agent } from '../agent/agent.js';
import type { AskMessage } from '../agent/messages.js';
import { colors } from '../render/render.js';

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
  return line.length > maxWidth ? line.slice(0, maxWidth - 1) + '…' : line;
}

type FlattenedRow = {
  id: string;
  label: string;
  nextHeadId: string | null;
  prefillText?: string;
  branchColumns: boolean[];
  connector: 'root' | 'branch' | 'continuation';
  isCurrentHead: boolean;
};

function getMessageText(message: AskMessage): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part?.type === 'text' && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

function getDisplayLabel(message: AskMessage): string {
  const text = getMessageText(message).trim();
  if (text) return text;
  return `[${message.role}]`;
}

function isVisibleUserMessage(message: AskMessage): boolean {
  return message.role === 'user' && !message._meta.uiHidden;
}

function getTreePrefix(row: FlattenedRow): string {
  let prefix = '';
  for (const hasLaterSibling of row.branchColumns) {
    prefix += hasLaterSibling ? '│ ' : '  ';
  }
  prefix += '│ ';
  if (row.connector === 'branch') {
    prefix += '├─';
  } else if (row.connector === 'continuation') {
    prefix += '│ ';
  }
  return prefix + '  ';
}

function flattenTree(agent: Agent): FlattenedRow[] {
  const rows: FlattenedRow[] = [];
  const roots = agent.getRewindTree();
  const currentHeadId = agent.currentHeadId;

  const visit = (
    node: (typeof roots)[number],
    branchColumns: boolean[],
    connector: FlattenedRow['connector'],
  ) => {
    const label = getDisplayLabel(node.message);
    const visibleUserMessage = isVisibleUserMessage(node.message);

    rows.push({
      id: node.message._meta.id,
      label,
      nextHeadId: visibleUserMessage
        ? node.message._meta.parentId
        : node.message._meta.id,
      prefillText: visibleUserMessage
        ? getMessageText(node.message)
        : undefined,
      branchColumns,
      connector,
      isCurrentHead: node.message._meta.id === currentHeadId,
    });

    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      visit(
        child,
        isLastChild ? branchColumns : [...branchColumns, true],
        isLastChild ? 'continuation' : 'branch',
      );
    });
  };

  roots.forEach((root, index) => {
    visit(root, index === roots.length - 1 ? [] : [true], 'root');
  });

  if (rows.length > 0) return rows;

  return [
    {
      id: 'rewind-start',
      label: '(start)',
      nextHeadId: null,
      branchColumns: [],
      connector: 'root',
      isCurrentHead: currentHeadId === null,
    },
  ];
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
  const textWidth = Math.max(20, width - 6);
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
        const treePrefix = getTreePrefix(row);
        const text = firstLine(row.label, textWidth);

        return (
          <Text key={rowIndex} color={selected ? colors.text : colors.muted}>
            {prefix}
            <Text color={colors.muted}>{treePrefix}</Text>
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
