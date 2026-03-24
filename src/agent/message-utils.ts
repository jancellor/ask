import type { ModelMessage, ToolCallPart, TextPart } from 'ai';

export type AskMessageMeta = {
  id: string;
  parentId: string | null;
  uiHidden?: boolean;
  timestamp?: string;
};

export type AskMessage = ModelMessage & { _meta: AskMessageMeta };

export function getToolCallParts(messages: ModelMessage[]): ToolCallPart[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return [];
    }

    return message.content.filter(
      (part): part is ToolCallPart => part.type === 'tool-call',
    );
  });
}

export function isRewindBoundary(message?: AskMessage): boolean {
  if (!message) return true;
  if (message.role === 'user' && message._meta.uiHidden) return true;
  if (message.role !== 'assistant') return false;
  return getToolCallParts([message]).length === 0;
}

export function extractFinalAssistantText(messages: ModelMessage[]): string {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== 'assistant') return '';
  return extractText(lastMessage);
}

export function extractText({ content }: ModelMessage): string {
  if (typeof content === 'string') return content;

  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
