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

export function isTurnStop(message?: ModelMessage): boolean {
  if (!message) return true;
  if (message.role !== 'assistant') return false;
  if (!Array.isArray(message.content)) return true;
  return !message.content.some((part) => part.type === 'tool-call');
}

export function extractFinalAssistantText(messages: ModelMessage[]): string {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== 'assistant') {
    throw new Error('no final assistant message found');
  }
  return extractText(lastMessage);
}

export function extractText({ content }: ModelMessage): string {
  if (typeof content === 'string') return content;

  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
