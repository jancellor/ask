import React from 'react';
import { render } from 'ink';
import { Agent } from '../agent/index.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { App } from './app.js';

type RunTuiOptions = {
  sessionId?: string;
  continueSession?: boolean;
};

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
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
