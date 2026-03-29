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
    messages,
    error,
    config,
    tipId,
    messageTree,
    pendingOperation,
    ask,
    cancel,
    clear,
    rewind,
  } = useAgentResult;

  const [rewindOpen, setRewindOpen] = useState(false);
  const [prefillText, setPrefillText] = useState('');

  const handleOpenRewind = async () => {
    setRewindOpen(true);
  };

  const handleRewindSelect = (selection: RewindSelection) => {
    unawaited(
      (async () => {
        await rewind(selection.messageId, () => {
          console.log('[Rewind]\n');
        });
        setPrefillText(selection.prefillText);
        setRewindOpen(false);
      })(),
    );
  };

  const handleCloseRewind = () => {
    setPrefillText('');
    setRewindOpen(false);
  };

  return (
    <Box flexDirection="column">
      <Messages
        messages={messages}
        error={error}
        model={config.model}
        provider={config.provider}
        variant={config.variant}
        pendingOperation={pendingOperation}
      />
      {rewindOpen ? (
        <Rewind
          tipId={tipId}
          messageTree={messageTree}
          onClose={handleCloseRewind}
          onSelect={handleRewindSelect}
        />
      ) : (
        <Input
          onAsk={ask}
          onCancel={cancel}
          onClear={clear}
          onRewind={handleOpenRewind}
          onRequestShutdown={onRequestShutdown}
          initialValue={prefillText}
        />
      )}
    </Box>
  );
}
