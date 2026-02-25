#!/usr/bin/env bun
import { runTui } from './tui/index.js';
import { runCli } from './cli/index.js';

function printUsage(): void {
  console.log('Usage: ask [OPTIONS] [MESSAGE]');
  console.log('');
  console.log('Options:');
  console.log('  --session, -s <id>   Load and continue a session (UUID)');
  console.log('  --continue, -c       Continue the most recent session');
  console.log('  --interactive        Force TUI mode');
  console.log('  --batch              Force non-interactive mode');
  console.log('  --model <id>         Override configured model');
  console.log('  -h, --help           Show this help');
  console.log('');
  console.log('Use -- to separate options from a message starting with -');
}

function parseArgs(args: string[]): {
  message: string | null;
  help: boolean;
  sessionId: string | null;
  interactive: boolean | null; // null = auto-detect
  continueLastSession: boolean;
} {
  let message: string | null = null;
  let help = false;
  let sessionId: string | null = null;
  let interactive: boolean | null = null;
  let continueLastSession = false;
  let endOfFlags = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!endOfFlags && arg === '--') {
      endOfFlags = true;
      continue;
    }

    if (!endOfFlags && (arg === '-h' || arg === '--help')) {
      help = true;
      break;
    }

    if (!endOfFlags && (arg === '--session' || arg === '-s')) {
      if (i + 1 >= args.length) {
        console.error(`Error: ${arg} requires an argument`);
        process.exit(1);
      }
      sessionId = args[i + 1];
      i++;
      continue;
    }

    if (!endOfFlags && (arg === '--continue' || arg === '-c')) {
      continueLastSession = true;
      continue;
    }

    if (!endOfFlags && arg === '--interactive') {
      interactive = true;
      continue;
    }

    if (!endOfFlags && arg === '--batch') {
      interactive = false;
      continue;
    }

    if (!endOfFlags && arg.startsWith('-')) {
      console.error(`Error: Unknown argument: ${arg}`);
      process.exit(1);
    }

    // First positional arg (or anything after --) is the message
    if (message === null) {
      message = arg;
      continue;
    }

    console.error(`Error: Unexpected argument: ${arg}`);
    process.exit(1);
  }

  return { message, help, sessionId, interactive, continueLastSession };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { message, help, sessionId, interactive, continueLastSession } = parseArgs(args);

  if (help) {
    printUsage();
    process.exit(0);
  }

  const opts = {
    sessionId: sessionId ?? undefined,
    continueLastSession,
  };

  // Determine mode: explicit flag > auto-detect from TTY + message presence
  const useInteractive =
    interactive !== null
      ? interactive
      : process.stdin.isTTY && message === null;

  if (useInteractive) {
    await runTui(opts);
  } else {
    await runCli(message ?? '', opts);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
