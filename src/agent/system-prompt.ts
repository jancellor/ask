import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SystemPrompt {
  build(): string {
    const promptPath = join(
      __dirname,
      '..',
      '..',
      'assets',
      'system-prompt.md',
    );
    return readFileSync(promptPath, 'utf-8');
  }
}
