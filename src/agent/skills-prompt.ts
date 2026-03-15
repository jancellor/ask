import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { ancestorPaths } from './paths.js';

export class SkillsPrompt {
  async build(): Promise<string> {
    const home = homedir();
    const cwd = process.cwd();

    const files = (
      await Promise.all(
        this.skillsRoots(home, cwd).map((root) => this.skillFiles(root)),
      )
    ).flat();

    const skills = (
      await Promise.all(files.map((abs) => this.parseSkill(abs, home, cwd)))
    ).filter((s) => !!s);

    if (!skills.length) return '';
    return [
      'The following agent skills have been loaded from SKILL.md files.\n' +
        'Agent skills contain additional instructions/code.\n' +
        'The following are just brief descriptions/summaries indicating relevance.\n' +
        'Read the full SKILL.md file when relevant to your task.',
      '<agent_skills>',
      '# Agent skills',
      ...skills.map(
        (s) => `## \`${s.name}\`\n\nPath: \`${s.path}\`\n\n${s.description}`,
      ),
      '</agent_skills>',
    ].join('\n\n');
  }

  private skillsRoots(home: string, cwd: string): string[] {
    return [
      ...new Set(
        [home, ...ancestorPaths(cwd)].map((p) => join(p, '.agents', 'skills')),
      ),
    ];
  }

  private async skillFiles(skillsRoot: string): Promise<string[]> {
    try {
      return (await readdir(skillsRoot, { recursive: true }))
        .filter((f) => /^skill\.md$/i.test(basename(String(f))))
        .map((f) => join(skillsRoot, String(f)));
    } catch {
      return [];
    }
  }

  private async parseSkill(
    abs: string,
    home: string,
    cwd: string,
  ): Promise<{ name: string; path: string; description: string } | undefined> {
    try {
      const content = await readFile(abs, 'utf-8');
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!match) return;
      const fields = parse(match[1]);
      if (!fields?.name || !fields?.description) return;
      const path = abs.startsWith(home + sep)
        ? '~' + abs.slice(home.length)
        : relative(cwd, abs);
      return { name: fields.name, path, description: fields.description };
    } catch {}
  }
}
