import React from 'react';
import { render } from 'ink';
import { type AgentOptions } from '../agent/agent.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { App } from './app.js';

type RunInteractiveOptions = {
  agentOptions: AgentOptions;
};

export async function runInteractive(
  options: RunInteractiveOptions,
): Promise<void> {
  const shutdownManager = new ShutdownManager();
  shutdownManager.installSignalHandlers();

  const app = render(
    <App
      agentOptions={options.agentOptions}
      shutdownManager={shutdownManager}
    />,
    { exitOnCtrlC: false },
  );

  shutdownManager.addListener(async () => {
    app.unmount();
    await app.waitUntilExit();
  });
  await app.waitUntilExit();
}
