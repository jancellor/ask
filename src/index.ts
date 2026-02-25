#!/usr/bin/env bun
import { Command } from 'commander';
import { runTui } from './tui/index.js';
import { runBatch } from './batch/index.js';

async function main(): Promise<void> {
  const program = new Command()
    .name('ask')
    .allowExcessArguments(false)
    .option('-s, --session <id>', 'use new or existing session')
    .option('-c, --continue', 'continue the most recent session')
    .option('-i, --interactive', 'force interactive mode')
    .option('-b, --batch', 'force batch mode')
    .argument('[message]');
  program.parse(process.argv);
  const opts = program.opts<{
    session?: string;
    continue?: boolean;
    model?: string;
    interactive?: boolean;
    batch?: boolean;
  }>();
  const message = program.args[0] as string | undefined;

  const mode: 'auto' | 'interactive' | 'batch' =
    opts.interactive && opts.batch
      ? 'auto'
      : opts.interactive
        ? 'interactive'
        : opts.batch
          ? 'batch'
          : 'auto';

  const runOptions = {
    sessionId: opts.session,
    continueSession: opts.continue,
  };

  const useInteractive =
    mode == 'interactive' ||
    (mode == 'auto' && process.stdin.isTTY && message === undefined);

  if (useInteractive) {
    await runTui(runOptions);
  } else {
    await runBatch(message, runOptions);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
