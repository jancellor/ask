import { useCallback, useEffect, useState } from 'react';
import { Agent, type AgentOptions } from '../agent/agent.js';
import type { AskMessage } from '../agent/messages.js';
import { ShutdownManager } from '../shutdown-manager.js';

import { unawaited } from '../unawaited/unawaited.js';

type UseAgentOptions = {
  agentOptions: AgentOptions;
  shutdownManager: ShutdownManager;
};

export type UseAgentResult = {
  agent: Agent;
  messages: AskMessage[];
  model: string;
  provider: string;
  variant: string | null;
  sendMessage: (message: string) => Promise<void>;
  abort: () => void;
  clear: (beforeClear?: () => void) => Promise<void>;
  rewind: (rewindId: string | null) => void;
};

export function useAgent({
  agentOptions,
  shutdownManager,
}: UseAgentOptions): UseAgentResult | null {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<AskMessage[]>([]);

  useEffect(() => {
    let inCleanup = false;
    let disposePromise: Promise<void> | null = null;

    const createPromise = Agent.create(agentOptions);
    const dispose = (): Promise<void> => {
      if (!disposePromise) {
        disposePromise = (async () => {
          const createdAgent = await createPromise;
          await createdAgent.cancelAll();
        })();
      }
      return disposePromise;
    };

    shutdownManager.addListener(dispose);

    unawaited(
      (async () => {
        const createdAgent = await createPromise;
        if (inCleanup) {
          await dispose();
        } else {
          setAgent(createdAgent);
        }
      })(),
    );

    return () => {
      inCleanup = true;
      setAgent(null);
      unawaited(
        (async () => {
          await dispose();
          shutdownManager.removeListener(dispose);
        })(),
      );
    };
  }, [agentOptions, shutdownManager]);

  useEffect(() => {
    if (!agent) return;
    setMessages([...agent.messages]);
    const listener = {
      onMessages: () => setMessages([...agent.messages]),
      onClear: () => setMessages([]),
    };
    agent.addListener(listener);
    return () => agent.removeListener(listener);
  }, [agent]);

  const sendMessage = useCallback(
    (message: string) => (agent ? agent.ask(message) : Promise.resolve()),
    [agent],
  );

  const abort = useCallback(() => {
    agent?.abort();
  }, [agent]);

  const clear = useCallback(
    (beforeClear?: () => void) =>
      agent ? agent.clear(beforeClear) : Promise.resolve(),
    [agent],
  );

  const rewind = useCallback(
    (rewindId: string | null) =>
      agent ? agent.rewind(rewindId) : Promise.resolve(),
    [agent],
  );

  if (!agent) return null;

  return {
    agent,
    messages,
    model: agent.model,
    provider: agent.provider,
    variant: agent.variant,
    sendMessage,
    abort,
    clear,
    rewind,
  };
}
