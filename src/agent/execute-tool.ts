import { tool } from 'ai';
import { type ChildProcessByStdio, spawn } from 'child_process';
import process from 'process';
import type { Readable } from 'stream';
import { z } from 'zod';

const DEFAULT_TIMEOUT_S = 60;
const TERMINATION_GRACE_MS = 5000;

const executeInputSchema = z.object({
  command: z.string().describe('The shell command to execute using `bash -c`'),
});

export type ExecuteToolOutput = {
  exit?: number;
  signal?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export class ExecuteTool {
  readonly name = 'execute';

  definition() {
    return tool({
      description:
        'Executes a shell command using `bash -c`. ' +
        'Can be multiline or whatever `bash -c` accepts. ' +
        'Returns stdout/stderr/exit/signal/error. ' +
        `Commands are killed after ${DEFAULT_TIMEOUT_S}s. `,
      inputSchema: executeInputSchema,
    });
  }

  async execute(
    input: unknown,
    signal: AbortSignal,
  ): Promise<ExecuteToolOutput> {
    const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_S * 1000);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    if (combinedSignal.aborted) {
      return {};
    }

    const { command } = executeInputSchema.parse(input);
    const child = spawn('bash', ['-c', command], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let error: string | undefined;
    let closed = false;

    const onAbort = () => {
      if (!closed) this.signalProcessGroup(child, 'SIGTERM');
      setTimeout(() => {
        if (!closed) this.signalProcessGroup(child, 'SIGKILL');
      }, TERMINATION_GRACE_MS).unref();
    };

    combinedSignal.addEventListener('abort', onAbort);

    child.stdout.on('data', (data: Buffer) => {
      stdoutChunks.push(data.toString());
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrChunks.push(data.toString());
    });

    child.on('error', (err: Error) => {
      error = err.message || String(err);
    });

    return new Promise<ExecuteToolOutput>((resolve) => {
      child.on('close', (exit, signal) => {
        closed = true;
        combinedSignal.removeEventListener('abort', onAbort);
        resolve({
          ...(exit !== null && { exit }),
          ...(signal && { signal }),
          ...(error && { error }),
          ...(stdoutChunks.length && { stdout: stdoutChunks.join('') }),
          ...(stderrChunks.length && { stderr: stderrChunks.join('') }),
        });
      });
    });
  }

  private signalProcessGroup(
    child: ChildProcessByStdio<null, Readable, Readable>,
    signal: NodeJS.Signals | number,
  ): void {
    if (child.killed || !child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error: unknown) {
      console.error(error);
    }
  }
}
