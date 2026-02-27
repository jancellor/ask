import type { LanguageModel } from 'ai';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { isMatch, merge } from 'lodash-es';
import { homedir } from 'os';
import { join } from 'path';
import type { ZodType } from 'zod';
import { check } from './check.js';
import {
  Config,
  ConfigSecrets,
  type GenerateOptions,
  type ModelConfig,
  type ProviderConfig,
  type VariantConfig,
} from './config-schema.js';
import { ignoreMissing } from './fs-ops.js';
import { createLanguageModel } from './provider-factories.js';

export type ConfigSelection = {
  provider?: string;
  model?: string;
  variant?: string | null;
  saveActive?: boolean;
};

export type ResolvedConfig = {
  provider: string;
  model: string;
  variant: string | null;
  options: GenerateOptions;
  languageModel: LanguageModel;
};

export class ConfigReader {
  private static CONFIG_DIR = join(homedir(), '.config', 'ask');
  private static CONFIG_PATH = join(ConfigReader.CONFIG_DIR, 'config.json');
  private static SECRETS_PATH = join(
    ConfigReader.CONFIG_DIR,
    'config.secrets.json',
  );

  async read(selection: ConfigSelection = {}): Promise<ResolvedConfig> {
    const [config, secrets] = await Promise.all([
      this.readConfigFile(),
      this.readSecretsFile(),
    ]);

    const { provider, providerConfig } = this.resolveProvider(
      config,
      selection,
    );
    const { model, modelConfig } = this.resolveModel(providerConfig, selection);
    const { variant, variantConfig } = this.resolveVariant(
      modelConfig,
      selection,
    );

    const providerSecretOptions = secrets[provider];

    if (selection.saveActive) {
      await this.maybeSaveActive(config, provider, model, variant);
    }

    const sdkProvider = providerConfig.sdkProvider ?? provider;
    const sdkModel = modelConfig.sdkModel ?? model;
    const providerOptions = providerConfig.providerOptions;

    const options = merge(
      {},
      config.options,
      providerConfig.options,
      modelConfig.options,
      variantConfig?.options,
    );

    const languageModel = createLanguageModel({
      sdkProvider,
      sdkModel,
      providerOptions,
      providerSecretOptions,
    });

    return {
      provider,
      model,
      variant,
      options,
      languageModel,
    };
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

  private async maybeSaveActive(
    config: Config,
    provider: string,
    model: string,
    variant: string | null,
  ): Promise<void> {
    const persistedVariant =
      config.providers?.[provider]?.models?.[model]?.activeVariant ?? null;
    // prevent unnecessary config only to set `activeVariant: null`
    const shouldOmitNullVariant = variant === null && persistedVariant === null;

    const patch = {
      activeProvider: provider,
      providers: {
        [provider]: {
          activeModel: model,
          ...(!shouldOmitNullVariant
            ? {
                models: {
                  [model]: {
                    activeVariant: variant,
                  },
                },
              }
            : {}),
        },
      },
    };

    if (isMatch(config, patch)) return;

    const patched = merge({}, config, patch);
    const serialized = JSON.stringify(patched, null, 2) + '\n';
    await this.writeConfigAtomically(serialized);
  }

  private async readConfigFile(): Promise<Config> {
    const raw = await this.readJsonFile(ConfigReader.CONFIG_PATH);
    return this.parseWithSchema('config.json', Config, raw ?? {});
  }

  private async readSecretsFile(): Promise<ConfigSecrets> {
    const raw = await this.readJsonFile(ConfigReader.SECRETS_PATH);
    return this.parseWithSchema(
      'config.secrets.json',
      ConfigSecrets,
      raw ?? {},
    );
  }

  private async writeConfigAtomically(data: string): Promise<void> {
    await mkdir(ConfigReader.CONFIG_DIR, { recursive: true });
    const path = ConfigReader.CONFIG_PATH;
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, data, 'utf-8');
    await rename(tempPath, path);
  }

  private resolveProvider(
    config: Config,
    selection: ConfigSelection,
  ): { provider: string; providerConfig: ProviderConfig } {
    const provider = selection.provider ?? config.activeProvider;
    check(provider, 'provider not specified');
    const providerConfig = config.providers?.[provider] ?? {
      sdkProvider: provider,
    };
    return { provider, providerConfig };
  }

  private resolveModel(
    provider: ProviderConfig,
    selection: ConfigSelection,
  ): { model: string; modelConfig: ModelConfig } {
    const model = selection.model ?? provider.activeModel;
    check(model, `model not specified`);
    const modelConfig = provider.models?.[model] ?? {
      sdkModel: model,
    };
    return { model, modelConfig };
  }

  private resolveVariant(
    model: ModelConfig,
    selection: ConfigSelection,
  ): { variant: string | null; variantConfig: VariantConfig | undefined } {
    const variant = selection.variant ?? model.activeVariant ?? null;
    const variantConfig = variant ? model.variants?.[variant] : undefined;
    if (variant) check(variantConfig, `variant not found: ${variant}`);
    return { variant, variantConfig };
  }
}
