#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { Agent, SessionStore } from '../agent/index.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { App } from './app.js';

type RunTuiOptions = {
  sessionId?: string;
};

export function runTui(options: RunTuiOptions = {}): void {
  const agent = new Agent();
  const sessionStore = new SessionStore(options.sessionId);
  sessionStore.attach(agent);

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
