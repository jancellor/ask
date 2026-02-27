import { AgentsPrompt } from './agents-prompt.js';
import { SkillsPrompt } from './skills-prompt.js';

export class InitPrompt {
  async build(): Promise<string> {
    const parts = await Promise.all([
      new AgentsPrompt().build(),
      new SkillsPrompt().build(),
    ]);
    return parts.filter(Boolean).join('\n\n');
  }
}
