import React from 'react';
import { render } from 'ink';
import { Agent, type AgentOptions } from '../agent/agent.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { App } from './app.js';

type RunTuiOptions = AgentOptions;

export async function runInteractive(options: RunTuiOptions): Promise<void> {
  const agent = await Agent.create(options);

  const shutdownManager = new ShutdownManager(async () => {
    try {
      app.unmount();
    } finally {
      await agent.cancelAll();
    }
  });
  shutdownManager.installSignalHandlers();

  const app = render(
    <App
      agent={agent}
      onRequestShutdown={() => shutdownManager.requestShutdown()}
    />,
    { exitOnCtrlC: false },
  );
}
