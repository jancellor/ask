import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ancestorPaths } from './paths.js';

export class AgentsPrompt {
  async build(): Promise<string> {
    const contents = (
      await Promise.all(
        [join(homedir(), '.agents'), ...ancestorPaths(process.cwd())].map(
          (dir) => this.tryRead(join(dir, 'AGENTS.md')),
        ),
      )
    ).filter(Boolean);

    if (!contents.length) return '';
    return [
      'Follow the instructions below that have come from AGENTS.md files.\n' +
        'You do not need to search for AGENTS.md files yourself.',
      '<agent_instructions>',
      ...contents,
      '</agent_instructions>',
    ].join('\n\n');
  }

  private async tryRead(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf-8');
    } catch {}
  }
}
