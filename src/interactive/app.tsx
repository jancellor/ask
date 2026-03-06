import React from 'react';
import { AgentOptions } from '../agent/agent.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { AppContent } from './app-content.js';
import { useAgent } from './use-agent.js';

type AppProps = {
  agentOptions: AgentOptions;
  shutdownManager: ShutdownManager;
};

export function App({ agentOptions, shutdownManager }: AppProps) {
  const useAgentResult = useAgent({ agentOptions, shutdownManager });

  if (!useAgentResult) return null;

  return (
    <AppContent
      useAgentResult={useAgentResult}
      onRequestShutdown={() => shutdownManager.requestShutdown()}
    />
  );
}
