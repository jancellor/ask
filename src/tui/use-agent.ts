import { useCallback, useEffect, useState } from 'react';
import { Agent, type AskMessage } from '../agent/index.js';

type UseAgentResult = {
  messages: AskMessage[];
  model: string;
  provider: string;
  variant: string | null;
  sendMessage: (message: string) => Promise<void>;
  abort: () => void;
  clear: (beforeClear?: () => void) => Promise<void>;
};

export function useAgent(agent: Agent): UseAgentResult {
  const [messages, setMessages] = useState<AskMessage[]>([]);

  useEffect(() => {
    setMessages([...agent.messages]);
    const listener = {
      onMessages: () => setMessages([...agent.messages]),
      onClear: () => setMessages([]),
    };
    agent.addListener(listener);
    return () => {
      agent.removeListener(listener);
    };
  }, [agent]);

  const sendMessage = useCallback(
    (message: string) => agent.ask(message),
    [agent],
  );

  const abort = useCallback(() => agent.abort(), [agent]);

  const clear = useCallback((beforeClear?: () => void) => agent.clear(beforeClear), [agent]);

  return {
    messages,
    model: agent.model,
    provider: agent.provider,
    variant: agent.variant,
    sendMessage,
    abort,
    clear,
  };
}
