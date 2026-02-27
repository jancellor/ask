import React from 'react';
import { Box, Static } from 'ink';
import type { AskMessage } from '../agent/agent.js';
import { AssistantPartMessage } from './assistant-part-message.js';
import { SpinnerMessage } from './spinner-message.js';
import { ToolPartMessage } from './tool-part-message.js';
import { UserPartMessage } from './user-part-message.js';
import { Welcome } from './welcome.js';

interface MessagesProps {
  messages: AskMessage[];
  model: string;
  provider: string;
  variant: string | null;
}

export function Messages({ messages: rawMessages, model, provider, variant }: MessagesProps) {
  const messages = rawMessages.filter((m) => !m._meta?.uiHidden);
  const toolResults = buildToolResultsMap(messages);

  const parts = messages.flatMap((message, i) =>
    getContentParts(message.content).map((part, j) => ({
      ...part,
      role: message.role,
      i,
      j,
      id: `${message.role}-${i}-${j}`,
    })),
  );

  const splitIdx = parts.findIndex(
    (p) => p.type === 'tool-call' && !toolResults.has(p.toolCallId),
  );

  const staticParts = splitIdx === -1 ? parts : parts.slice(0, splitIdx);
  const activeParts = splitIdx === -1 ? [] : parts.slice(splitIdx);

  type MessagePart = (typeof parts)[number];
  type WelcomeItem = { id: 'welcome'; type: 'welcome' };
  type StaticItem = WelcomeItem | MessagePart;

  const allStaticItems: StaticItem[] = [
    { id: 'welcome', type: 'welcome' },
    ...staticParts,
  ];

  const renderPart = (p: MessagePart) => {
    if (p.role === 'assistant' && p.type === 'text') {
      return <AssistantPartMessage key={p.id} text={p.text} dim={false} />;
    }
    if (p.role === 'user') {
      if (p.type === 'text') {
        return <UserPartMessage key={p.id} text={p.text} />;
      }
    }
    if (p.type === 'tool-call') {
      return (
        <ToolPartMessage
          key={p.id}
          toolName={p.toolName ?? toolResults.get(p.toolCallId)?.toolName}
          input={p.input}
          output={toolResults.get(p.toolCallId)?.output}
        />
      );
    }
    return null;
  };

  const showSpinner = messages.length > 0 && messages.at(-1)!.role !== 'assistant';

  return (
    <Box flexGrow={1} flexDirection="column">
      <Static items={allStaticItems}>
        {(item) => {
          if (item.type === 'welcome') {
            return (
              <Welcome
                key="welcome"
                model={model}
                provider={provider}
                variant={variant}
              />
            );
          }
          return renderPart(item as MessagePart);
        }}
      </Static>
      {activeParts.map(renderPart)}
      {showSpinner && <SpinnerMessage />}
    </Box>
  );
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string | null; input: unknown };

function getContentParts(content: unknown): ContentPart[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  const parts: ContentPart[] = [];
  for (const p of content) {
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'text' && typeof p.text === 'string') {
      parts.push({ type: 'text', text: p.text });
    } else if (p.type === 'tool-call' && typeof p.toolCallId === 'string') {
      parts.push({
        type: 'tool-call',
        toolCallId: p.toolCallId,
        toolName: typeof p.toolName === 'string' ? p.toolName : null,
        input: p.input,
      });
    }
  }
  return parts;
}

type ToolResultData = {
  toolName: string | null;
  output: unknown;
};

function buildToolResultsMap(messages: AskMessage[]): Map<string, ToolResultData> {
  const map = new Map<string, ToolResultData>();
  for (const message of messages) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'tool-result' && 'output' in part) {
        map.set(part.toolCallId, {
          toolName: typeof part.toolName === 'string' ? part.toolName : null,
          output: part.output,
        });
      }
    }
  }
  return map;
}
