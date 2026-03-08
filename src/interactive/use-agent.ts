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
  pendingOperation: boolean;
  sendMessage: (message: string) => Promise<string>;
  abort: () => void;
  clear: (beforeClear?: () => void) => Promise<void>;
  rewind: (rewindId: string | null) => Promise<void>;
};

export function useAgent({
  agentOptions,
  shutdownManager,
}: UseAgentOptions): UseAgentResult | null {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingOperation = pendingCount > 0;

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
  }, [agent]);

  const runWithPendingOperation = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      setPendingCount((n) => n + 1);
      try {
        return await task();
      } finally {
        setPendingCount((n) => n - 1);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    (message: string) =>
      agent
        ? runWithPendingOperation(() =>
            agent.ask(message, () => setMessages([...agent.messages])),
          )
        : Promise.resolve(''),
    [agent, runWithPendingOperation],
  );

  const abort = useCallback(() => {
    agent?.abort();
  }, [agent]);

  const clear = useCallback(
    async (beforeClear?: () => void) => {
      if (!agent) return;
      await runWithPendingOperation(() => agent.clear(beforeClear));
      setMessages([...agent.messages]);
    },
    [agent, runWithPendingOperation],
  );

  const rewind = useCallback(
    async (rewindId: string | null) => {
      if (!agent) return;
      await runWithPendingOperation(() => agent.rewind(rewindId));
      setMessages([...agent.messages]);
    },
    [agent, runWithPendingOperation],
  );

  if (!agent) return null;

  return {
    agent,
    messages,
    model: agent.model,
    provider: agent.provider,
    variant: agent.variant,
    pendingOperation,
    sendMessage,
    abort,
    clear,
    rewind,
  };
}
