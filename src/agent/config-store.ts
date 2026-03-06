import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { Config, ConfigSecrets } from './config-schema.js';
import { ignoreMissing } from './fs-ops.js';

export class ConfigStore {
  private static CONFIG_DIR = join(homedir(), '.config', 'ask');
  private static CONFIG_PATH = join(ConfigStore.CONFIG_DIR, 'config.json');
  private static SECRETS_PATH = join(
    ConfigStore.CONFIG_DIR,
    'config.secrets.json',
  );

  async readConfig(): Promise<Config> {
    const raw = await this.readJsonFile(ConfigStore.CONFIG_PATH);
    return this.parseWithSchema('config.json', Config, raw ?? {});
  }

  async readSecrets(): Promise<ConfigSecrets> {
    const raw = await this.readJsonFile(ConfigStore.SECRETS_PATH);
    return this.parseWithSchema(
      'config.secrets.json',
      ConfigSecrets,
      raw ?? {},
    );
  }

  async writeConfig(config: Config): Promise<void> {
    const serialized = JSON.stringify(config, null, 2) + '\n';
    await this.writeConfigAtomically(serialized);
  }

  private async readJsonFile(path: string): Promise<unknown | undefined> {
    const content = await ignoreMissing(() => readFile(path, 'utf-8'));
    if (content === undefined) return undefined;
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`invalid JSON in ${path}`);
    }
  }

  private parseWithSchema<T>(
    schemaName: string,
    parser: ZodType<T>,
    input: unknown,
  ): T {
    const result = parser.safeParse(input);
    if (result.success) return result.data;
    throw new Error(
      `invalid ${schemaName}: ${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }

  private async writeConfigAtomically(data: string): Promise<void> {
    await mkdir(ConfigStore.CONFIG_DIR, { recursive: true });
    const path = ConfigStore.CONFIG_PATH;
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, data, 'utf-8');
    await rename(tempPath, path);
  }
}
