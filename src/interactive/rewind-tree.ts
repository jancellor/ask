import { type Agent, AskMessage, type RewindNode } from '../agent/agent.js';

export type FlattenedRow = {
  id: string;
  label: string;
  nextHeadId: string | null;
  prefillText?: string;
  treePrefix: string;
  isCurrentHead: boolean;
};

export function flattenTree(agent: Agent): FlattenedRow[] {
  const roots = agent.getRewindTree();
  const headId = agent.currentHeadId;
  return roots.flatMap((root) => renderNode(root, headId, 0, 0));
}

function renderNode(
  node: RewindNode,
  headId: string | null,
  a: number,
  b: number,
): FlattenedRow[] {
  const visible = isVisible(node.message);
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
    return renderNode(child, headId, childA, childB);
  });
  const prefix = getPrefix(a, b, childRows.length > 0 ? 1 : 0);
  const label = getDisplayLabel(node.message);
  const visibleUserMessage = isVisibleUserMessage(node.message);
  const row = !visible
    ? []
    : [
        {
          id: node.message._meta.id,
          label: label,
          nextHeadId: visibleUserMessage
            ? node.message._meta.parentId
            : node.message._meta.id,
          prefillText: visibleUserMessage
            ? getMessageText(node.message)
            : undefined,
          treePrefix: prefix,
          isCurrentHead: node.message._meta.id === headId,
        },
      ];
  return [...row, ...childRows];
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

function isVisible(message: AskMessage): boolean {
  return !message._meta.uiHidden && message.role === 'user';
}

function isVisibleUserMessage(message: AskMessage): boolean {
  return message.role === 'user' && isVisible(message);
}

function cell(u: boolean, d: boolean, l: boolean, r: boolean) {
  const glyphs = ' ╶╴─╷┌┐┬╵└┘┴│├┤┼';
  const x = glyphs[(u ? 8 : 0) | (d ? 4 : 0) | (l ? 2 : 0) | (r ? 1 : 0)];
  const y = glyphs[r ? 3 : 0];
  return `${x}${y}`;
}
