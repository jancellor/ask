import React from 'react';
import { Box } from 'ink';
import { type Agent } from '../agent/index.js';
import { Input } from './input.js';
import { Messages } from './messages.js';
import { useAgent } from './use-agent.js';

type AppProps = {
  agent: Agent;
  onRequestShutdown: () => void;
};

export function App({ agent, onRequestShutdown }: AppProps) {
  const { messages, model, provider, variant, sendMessage, abort, clear } =
    useAgent(agent);

  const handleSubmit = (message: string) => {
    void sendMessage(message);
  };

  return (
    <Box flexDirection="column" height="100%">
      <Messages
        messages={messages}
        model={model}
        provider={provider}
        variant={variant}
      />
      <Input
        onSubmit={handleSubmit}
        onAbort={abort}
        onClear={clear}
        onRequestShutdown={onRequestShutdown}
      />
    </Box>
  );
}
