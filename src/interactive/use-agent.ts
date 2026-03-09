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
  ask: (message: string) => Promise<void>;
  abort: () => Promise<void>;
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
          await createdAgent.abortAll();
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
    async (task: () => Promise<unknown>): Promise<void> => {
      setPendingCount((n) => n + 1);
      try {
        await task();
      } finally {
        setPendingCount((n) => n - 1);
      }
    },
    [],
  );

  const ask = useCallback(
    (message: string): Promise<void> => {
      if (!agent) return Promise.resolve();
      return runWithPendingOperation(() =>
        agent.ask(message, () => setMessages([...agent.messages])),
      );
    },
    [agent, runWithPendingOperation],
  );

  const abort = useCallback((): Promise<void> => {
    if (!agent) return Promise.resolve();
    return runWithPendingOperation(() => agent.abortCurrent());
  }, [agent, runWithPendingOperation]);

  const clear = useCallback(
    (beforeClear?: () => void): Promise<void> => {
      if (!agent) return Promise.resolve();
      return runWithPendingOperation(async () => {
        await agent.clear(beforeClear);
        setMessages([...agent.messages]);
      });
    },
    [agent, runWithPendingOperation],
  );

  const rewind = useCallback(
    (rewindId: string | null): Promise<void> => {
      if (!agent) return Promise.resolve();
      return runWithPendingOperation(async () => {
        await agent.rewind(rewindId);
        setMessages([...agent.messages]);
      });
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
    ask,
    abort,
    clear,
    rewind,
  };
}
