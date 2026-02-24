import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class ConfigReader {
  private static CONFIG_PATH = join(
    homedir(),
    '.config',
    'gent',
    'config.json',
  );

  private readConfigFile(): Record<string, unknown> {
    try {
      return JSON.parse(
        readFileSync(ConfigReader.CONFIG_PATH, 'utf-8'),
      ) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private envOrFile(
    envKey: string,
    fileKey: string,
    fileValues: Record<string, unknown>,
  ): string {
    const envValue = process.env[envKey];
    if (envValue) return envValue.trim();
    const fileValue = fileValues[fileKey];
    if (fileValue != null) return String(fileValue).trim();
    throw new Error(`neither ${envKey} nor ${fileKey} is set`);
  }

  private optionalEnvOrFile(
    envKey: string,
    fileKey: string,
    fileValues: Record<string, unknown>,
  ): string | undefined {
    const envValue = process.env[envKey];
    if (envValue && envValue.trim()) return envValue.trim();

    const fileValue = fileValues[fileKey];
    if (fileValue == null) return undefined;

    const value = String(fileValue).trim();
    return value ? value : undefined;
  }

  private isOpenAIBaseUrl(baseUrl: string): boolean {
    try {
      return new URL(baseUrl).hostname.includes('openai.com');
    } catch {
      return baseUrl.includes('openai.com');
    }
  }

  read(): Config {
    const fileValues = this.readConfigFile();
    const baseUrl = this.envOrFile('GENT_BASE_URL', 'base_url', fileValues);
    const apiKey = this.optionalEnvOrFile('GENT_API_KEY', 'api_key', fileValues);

    if (!apiKey && !this.isOpenAIBaseUrl(baseUrl)) {
      throw new Error(
        'neither GENT_API_KEY nor api_key is set (required unless GENT_BASE_URL/base_url points to openai.com)',
      );
    }

    return {
      apiKey: apiKey ?? 'oauth',
      model: this.envOrFile('GENT_MODEL', 'model', fileValues),
      baseUrl,
    };
  }
}
