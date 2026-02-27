#!/usr/bin/env node
import { Command } from 'commander';
import { runTui } from './tui/index.js';
import { runBatch } from './batch/index.js';
import { runConfig } from './config/index.js';

async function main(): Promise<void> {
  const program = new Command()
    .name('ask')
    .allowExcessArguments(false)
    .option('-p, --provider <provider>', 'provider to use for this run')
    .option('-m, --model <model>', 'model to use for this run')
    .option('-v, --variant [variant]', 'variant to use (or none)')
    .option('-c, --config', 'set/show current config and exit')
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
    provider?: string;
    model?: string;
    variant?: string | true;
    config?: true;
    interactive?: true;
    batch?: true;
  }>();
  const message = program.args[0] as string | undefined;

  const variant = opts.variant === true ? null : opts.variant;
  const configOptions = {
    provider: opts.provider,
    model: opts.model,
    variant,
  };

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

  const agentOptions = {
    resume: opts.resume,
    fork: opts.fork,
    ...configOptions,
  };

  if (opts.config) {
    await runConfig(configOptions);
  } else if (useInteractive) {
    await runTui(agentOptions);
  } else {
    await runBatch(message, agentOptions);
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
