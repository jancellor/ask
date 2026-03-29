import type { MessageNode } from '../agent/agent.js';
import { type AskMessage } from '../agent/agent.js';
import { extractText } from '../agent/message-utils.js';

export const REWIND_FILTERS = ['user', 'user-agent'] as const;

export type RewindFilter = (typeof REWIND_FILTERS)[number];

export type RewindRow = {
  role: AskMessage['role'];
  parentId: string | null;
  parentIsTip: boolean;
  prefillText: string;
  label: string;
  treePrefix: string;
};

// consider having "b" toggle whether branches are shown
// should be easy by making this a type of filter
export function flattenTree(
  messageTree: () => MessageNode | null,
  tipId: string | null,
  filter: RewindFilter,
): RewindRow[] {
  const root = messageTree();
  if (!root) return [];
  return renderNode(root, tipId, filter, 0, 0);
}

function renderNode(
  node: MessageNode,
  tipId: string | null,
  filter: RewindFilter,
  a: number,
  b: number,
): RewindRow[] {
  const { prefillText, displayLabel } = getMessageText(node.message);
  const visible = isVisible(node.message, filter, displayLabel);
  const shouldAppendRow = node.children.length === 0 && node.age > 0;
  const childRows = node.children.flatMap((child, i) => {
    const l = node.children.length;
    const [childA, childB] = visible
      ? i === l - 1
        ? [a + b, 0]
        : [a + b, 1]
      : l === 1
        ? [a, b]
        : i === 0
          ? [a, b + 1]
          : i < l - 1
            ? [a + b, 1]
            : [a + b, 0];
    return renderNode(child, tipId, filter, childA, childB);
  });
  const hasRealOrAppendedChild = childRows.length > 0 || shouldAppendRow;
  const row = {
    role: node.message.role,
    parentId: node.message._meta.parentId,
    parentIsTip: node.message._meta.parentId === tipId,
    prefillText: node.message.role === 'user' ? prefillText : '',
    label: displayLabel,
    treePrefix: getPrefix(a, b, hasRealOrAppendedChild ? 1 : 0),
  };
  const appendedRow = {
    role: node.message.role,
    parentId: node.message._meta.id,
    parentIsTip: node.message._meta.id === tipId,
    prefillText: '',
    label: '',
    treePrefix: getPrefix(a + b, 0, 0),
  };

  return [
    ...(!visible ? [] : [row]),
    ...(shouldAppendRow ? [appendedRow] : []),
    ...childRows,
  ];
}

/**
 * @param a number of vertical lines corresponding to non-ancestor branches
 * @param b number of indents from the previous row
 * @param c 1 if the last cell needs to draw a connecting line to children
 */
export function getPrefix(a: number, b: number, c: number) {
  return (
    cell(true, true, false, false).repeat(a) +
    Array.from({ length: b + 1 })
      .map((_, i) => cell(i === 0, i < b || c === 1, i > 0, i < b))
      .join('')
  );
}

function getMessageText(message: AskMessage): {
  prefillText: string;
  displayLabel: string;
} {
  const prefillText = extractText(message);
  const displayLabel = firstLine(prefillText);
  return { prefillText, displayLabel };
}

function firstLine(text: string): string {
  return text.split(/\r\n|[\r\n]/, 1)[0] ?? '';
}

function isVisible(
  message: AskMessage,
  filter: RewindFilter,
  displayLabel: string,
): boolean {
  const role = message.role;
  const uiHidden = message._meta.uiHidden;
  switch (filter) {
    case 'user':
      return !uiHidden && role === 'user';
    case 'user-agent':
      return (
        !uiHidden &&
        (role === 'user' || (role === 'assistant' && !!displayLabel))
      );
  }
}

function cell(u: boolean, d: boolean, l: boolean, r: boolean) {
  const glyphs = ' ╶╴─╷┌┐┬╵└┘┴│├┤┼';
  const x = glyphs[(u ? 8 : 0) | (d ? 4 : 0) | (l ? 2 : 0) | (r ? 1 : 0)];
  const y = glyphs[r ? 3 : 0];
  return `${x}${y}`;
}
