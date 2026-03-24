#!/usr/bin/env node
import { Command } from 'commander';
import { runInteractive } from './interactive/run.js';
import { RenderOutput, runBatch } from './batch/run.js';
import { runConfig } from './config/run.js';

async function main(): Promise<void> {
  const program = new Command()
    .name('ask')
    .allowExcessArguments(false)
    .option('-p, --provider <provider>', 'provider to use for this run')
    .option('-m, --model <model>', 'model to use for this run')
    .option('-v, --variant [variant]', 'variant to use (or none)')
    .option('-c, --config', 'set/show current config and exit')
    .option('-r, --resume [id]', 'resume from given (or last) message')
    .option('-i, --interactive', 'force interactive mode')
    .option('-b, --batch', 'force batch mode')
    .option('--render-output <when>', '(auto, always, never)', 'auto')
    .addHelpText(
      'after',
      '\nUse -- before prompt if ambiguous (eg ask -r -- "follow up question")',
    )
    .argument('[prompt]');
  program.parse(process.argv);
  const opts = program.opts<{
    resume?: string | true;
    provider?: string;
    model?: string;
    variant?: string | true;
    config?: true;
    interactive?: true;
    batch?: true;
    renderOutput: string;
  }>();
  const prompt = program.args[0] as string | undefined;

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
    (mode == 'auto' && process.stdin.isTTY && prompt === undefined);

  const renderOutput = parseRenderOutput(opts.renderOutput);

  const agentOptions = {
    resume: opts.resume,
    ...configOptions,
  };

  if (opts.config) {
    await runConfig(configOptions);
  } else if (useInteractive) {
    await runInteractive({ agentOptions });
  } else {
    await runBatch({ prompt, agentOptions, renderOutput });
  }
}

function parseRenderOutput(value: string): RenderOutput {
  const normalizedValue = value.toLowerCase();
  const result = RenderOutput.safeParse(normalizedValue);
  if (result.success) return result.data;
  throw new Error(`--render-output value not expected`);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
