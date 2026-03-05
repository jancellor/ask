import React, { useState } from 'react';
import { Box } from 'ink';
import { type Agent } from '../agent/agent.js';
import { Input } from './input.js';
import { Messages } from './messages.js';
import { Rewind, type RewindSelection } from './rewind.js';
import { useAgent } from './use-agent.js';

type AppProps = {
  agent: Agent;
  onRequestShutdown: () => void;
};

export function App({ agent, onRequestShutdown }: AppProps) {
  const {
    messages,
    model,
    provider,
    variant,
    sendMessage,
    abort,
    clear,
    rewind,
  } = useAgent(agent);

  const [rewindOpen, setRewindOpen] = useState(false);
  const [prefillText, setPrefillText] = useState('');

  const handleSubmit = (message: string) => {
    void sendMessage(message);
  };

  const handleOpenRewind = async () => {
    await agent.cancelAll();
    setRewindOpen(true);
  };

  const handleRewindSelect = (selection: RewindSelection) => {
    rewind(selection.rewindId);
    setPrefillText(selection.prefillText);
    setRewindOpen(false);
  };

  const handleCloseRewind = () => {
    setPrefillText('');
    setRewindOpen(false);
  };

  return (
    <Box flexDirection="column">
      <Messages
        messages={messages}
        model={model}
        provider={provider}
        variant={variant}
      />
      {rewindOpen ? (
        <Rewind
          agent={agent}
          onClose={handleCloseRewind}
          onSelect={handleRewindSelect}
        />
      ) : (
        <Input
          onSubmit={handleSubmit}
          onAbort={abort}
          onClear={clear}
          onRewind={handleOpenRewind}
          onRequestShutdown={onRequestShutdown}
          initialValue={prefillText}
        />
      )}
    </Box>
  );
}
