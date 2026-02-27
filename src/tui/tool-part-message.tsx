import React from 'react';
import { ExecuteToolPartMessage } from './execute-tool-part-message.js';
import { GenericToolPartMessage } from './generic-tool-part-message.js';

interface ToolPartMessageProps {
  toolName: string | null | undefined;
  input: unknown;
  output: unknown;
}

export type ToolPartMessageRenderProps = {
  toolName: string | null | undefined;
  input: unknown;
  output: unknown;
};

export function ToolPartMessage({
  toolName,
  input,
  output,
}: ToolPartMessageProps) {
  if (toolName === 'execute') {
    return (
      <ExecuteToolPartMessage
        toolName={toolName}
        input={input}
        output={output}
      />
    );
  }
  return (
    <GenericToolPartMessage toolName={toolName} input={input} output={output} />
  );
}
