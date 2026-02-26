import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SystemPrompt {
  build(): string {
    const promptPath = join(__dirname, '..', '..', 'assets', 'system-prompt.md');
    return readFileSync(promptPath, 'utf-8');
  }
}
