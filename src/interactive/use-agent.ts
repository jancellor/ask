import { useCallback, useEffect, useRef, useState } from 'react';
import { Agent, type AgentOptions } from '../agent/agent.js';
import type { ResolvedConfig } from '../agent/config.js';
import type { MessageNode } from '../agent/message-graph.js';
import type { AskMessage } from '../agent/message-utils.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { unawaited } from '../unawaited/unawaited.js';

type UseAgentOptions = {
  agentOptions: AgentOptions;
  shutdownManager: ShutdownManager;
};

export type UseAgentResult = {
  messages: AskMessage[];
  error: unknown | null;
  config: ResolvedConfig;
  tipId: string | null;
  messageTree: () => MessageNode | null;
  pendingOperation: boolean;
  ask: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  clear: (beforeClear?: () => void) => Promise<void>;
  rewind: (
    messageId: string | null,
    beforeRewind?: () => void,
  ) => Promise<void>;
};

export function useAgent({
  agentOptions,
  shutdownManager,
}: UseAgentOptions): UseAgentResult | null {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [error, setError] = useState<unknown | null>(null);
  const [pendingOperation, setPendingOperation] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const streamVersionRef = useRef(0);

  useEffect(() => {
    let inCleanup = false;
    let disposePromise: Promise<void> | null = null;

    const createPromise = Agent.create(agentOptions);
    const dispose = (): Promise<void> => {
      if (!disposePromise) {
        disposePromise = (async () => {
          const createdAgent = await createPromise;
          await createdAgent.close();
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
    const version = ++streamVersionRef.current;

    const consumeMessages = async (): Promise<void> => {
      const collected: AskMessage[] = [];
      setMessages([]);
      setError(null);

      try {
        for await (const message of agent.messageEvents()) {
          if (streamVersionRef.current !== version) return;
          collected.push(message);
          setMessages([...collected]);
        }
      } catch (e) {
        if (streamVersionRef.current !== version) return;
        setError(e);
      } finally {
        if (streamVersionRef.current === version) {
          setPendingOperation(false);
        }
      }
    };

    unawaited(consumeMessages());
    return () => {
      streamVersionRef.current += 1;
    };
  }, [agent, streamVersion]);

  const ask = useCallback(
    async (prompt: string): Promise<void> => {
      if (!agent) return;
      setPendingOperation(true);
      await agent.ask(prompt);
      setStreamVersion((v) => v + 1);
    },
    [agent],
  );

  const cancel = useCallback(async (): Promise<void> => {
    await agent?.cancel();
  }, [agent]);

  const clear = useCallback(
    async (beforeClear?: () => void): Promise<void> => {
      if (!agent) return;
      await agent.clear();
      beforeClear?.();
      setPendingOperation(false);
      setStreamVersion((v) => v + 1);
    },
    [agent],
  );

  const rewind = useCallback(
    async (
      messageId: string | null,
      beforeRewind?: () => void,
    ): Promise<void> => {
      if (!agent) return;
      await agent.rewind(messageId);
      beforeRewind?.();
      setPendingOperation(false);
      setStreamVersion((v) => v + 1);
    },
    [agent],
  );

  if (!agent) return null;

  return {
    messages,
    error,
    config: agent.config,
    tipId: agent.tipId,
    messageTree: () => agent.messageTree(),
    pendingOperation,
    ask,
    cancel,
    clear,
    rewind,
  };
}
