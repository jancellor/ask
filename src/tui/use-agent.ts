import { useCallback, useEffect, useState } from 'react';
import { Agent, type AskMessage } from '../agent/index.js';

type UseAgentResult = {
  messages: AskMessage[];
  modelId: string;
  provider: string;
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
    (message: string) => agent.sendMessage(message),
    [agent],
  );

  const abort = useCallback(() => agent.abort(), [agent]);

  const clear = useCallback((beforeClear?: () => void) => agent.clear(beforeClear), [agent]);

  const provider = new URL(agent.baseUrl).hostname.split('.').at(-2) ?? agent.baseUrl;

  return {
    messages,
    modelId: agent.modelId,
    provider,
    sendMessage,
    abort,
    clear,
  };
}
