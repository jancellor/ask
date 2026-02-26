#!/usr/bin/env node
import { Command } from 'commander';
import { runTui } from './tui/index.js';
import { runBatch } from './batch/index.js';

async function main(): Promise<void> {
  const program = new Command()
    .name('ask')
    .allowExcessArguments(false)
    .option('-r, --resume [id]', 'read from given (or last) session')
    .option('-f, --fork [id]', 'write to given (or random) session')
    .option('-i, --interactive', 'force interactive mode')
    .option('-b, --batch', 'force batch mode')
    .addHelpText(
      'after',
      '\nUse -- before message if ambiguous (eg ask -r -- "follow up question")',
    )
    .argument('[message]');
  program.parse(process.argv);
  const opts = program.opts<{
    resume?: string | true;
    fork?: true | string;
    interactive?: true;
    batch?: true;
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

  const useInteractive =
    mode == 'interactive' ||
    (mode == 'auto' && process.stdin.isTTY && message === undefined);

  useInteractive ? await runTui(opts) : await runBatch(message, opts);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
