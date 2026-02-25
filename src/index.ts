#!/usr/bin/env bun
import { runTui } from './tui/index.js';
import { runCli } from './cli/index.js';

function printUsage(): void {
  console.log('Usage:');
  console.log('  ask                    Run in interactive TUI mode');
  console.log('  ask -p, --print <msg>  Run in non-interactive mode');
  console.log(
    '  ask --session <id>     Use specific session ID for message storage',
  );
  console.log('  ask -h, --help         Show this help');
}

function parseArgs(args: string[]): {
  message: string | null;
  help: boolean;
  sessionId: string | null;
} {
  let message: string | null = null;
  let help = false;
  let sessionId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      help = true;
      break;
    }

    if (arg === '-p' || arg === '--print') {
      if (i + 1 >= args.length) {
        console.error('Error: --print requires an argument');
        process.exit(1);
      }
      message = args[i + 1];
      i++; // Skip the next argument since we consumed it
      continue;
    }

    if (arg === '--session') {
      if (i + 1 >= args.length) {
        console.error('Error: --session requires an argument');
        process.exit(1);
      }
      sessionId = args[i + 1];
      i++; // Skip the next argument since we consumed it
      continue;
    }

    // If no flag specified but there's a positional arg, treat it as message
    if (!arg.startsWith('-') && message === null) {
      message = arg;
      continue;
    }

    console.error(`Error: Unknown argument: ${arg}`);
    process.exit(1);
  }

  return { message, help, sessionId };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { message, help, sessionId } = parseArgs(args);

  if (help) {
    printUsage();
    process.exit(0);
  }

  if (message !== null) {
    // Non-interactive mode
    await runCli(message, { sessionId: sessionId ?? undefined });
  } else {
    // Interactive TUI mode
    runTui({ sessionId: sessionId ?? undefined });
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
