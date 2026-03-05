import { type Agent, AskMessage, type MessageNode } from '../agent/agent.js';

export const REWIND_FILTERS = ['user', 'user-agent'] as const;

export type RewindFilter = (typeof REWIND_FILTERS)[number];

export type RewindRow = {
  role: AskMessage['role'];
  parentId: string | null;
  parentIsHead: boolean;
  prefillText: string;
  label: string;
  treePrefix: string;
};

export function flattenTree(agent: Agent, filter: RewindFilter): RewindRow[] {
  const roots = agent.getMessageTree();
  const headId = agent.currentHeadId;
  return roots.flatMap((root) => renderNode(root, headId, filter, 0, 0));
}

function renderNode(
  node: MessageNode,
  headId: string | null,
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
    return renderNode(child, headId, filter, childA, childB);
  });
  const hasRealOrAppendedChild = childRows.length > 0 || shouldAppendRow;
  const row = {
    role: node.message.role,
    parentId: node.message._meta.parentId,
    parentIsHead: node.message._meta.parentId === headId,
    prefillText,
    label: displayLabel,
    treePrefix: getPrefix(a, b, hasRealOrAppendedChild ? 1 : 0),
  };
  const appendedRow = {
    role: node.message.role,
    parentId: node.message._meta.id,
    parentIsHead: node.message._meta.id === headId,
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
  const content = message.content;
  let prefillText;
  if (typeof content === 'string') prefillText = content;
  else if (!Array.isArray(content)) prefillText = '';
  else
    prefillText = content
      .filter(
        (part): part is { type: 'text'; text: string } =>
          part.type === 'text' && typeof part.text === 'string',
      )
      .map((part) => part.text)
      .join('\n');
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
