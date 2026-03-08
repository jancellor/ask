import React, { useState } from 'react';
import { Box } from 'ink';
import { Input } from './input.js';
import { Messages } from './messages.js';
import { Rewind, type RewindSelection } from './rewind.js';
import type { UseAgentResult } from './use-agent.js';
import { unawaited } from '../unawaited/unawaited.js';

type AppContentProps = {
  useAgentResult: UseAgentResult;
  onRequestShutdown: () => void;
};

export function AppContent({
  useAgentResult,
  onRequestShutdown,
}: AppContentProps) {
  const {
    agent,
    messages,
    model,
    provider,
    variant,
    sendMessage,
    abort,
    clear,
    rewind,
  } = useAgentResult;

  const [rewindOpen, setRewindOpen] = useState(false);
  const [prefillText, setPrefillText] = useState('');

  const handleSubmit = async (message: string) => {
    await sendMessage(message);
  };

  const handleOpenRewind = async () => {
    await agent.cancelAll();
    setRewindOpen(true);
  };

  const handleRewindSelect = (selection: RewindSelection) => {
    unawaited(rewind(selection.rewindId));
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
