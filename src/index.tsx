#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { Agent } from './agent/index.js';
import { ShutdownManager } from './shutdown-manager.js';
import { App } from './tui/app.js';

const agent = new Agent();

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
