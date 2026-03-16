import type { LanguageModel } from 'ai';
import { isMatch, merge } from 'lodash-es';
import { check } from './check.js';
import {
  type Config,
  type GenerateOptions,
  type ModelConfig,
  type ProviderSettings,
  type ProviderConfig,
  type ProviderSecretOptions,
  type VariantConfig,
} from './config-schema.js';
import { ConfigStore } from './config-store.js';
import { createLanguageModel } from './provider-factories.js';

export type ConfigOptions = {
  provider?: string;
  model?: string;
  variant?: string | null;
  saveAsCurrent?: boolean;
};

export type ResolvedConfig = {
  provider: string;
  model: string;
  variant: string | null;
  sdkProvider: string;
  sdkModel: string;
  providerSettings: ProviderSettings;
  generateOptions: GenerateOptions;
  languageModel: LanguageModel;
};

export class ConfigReader {
  private store: ConfigStore;

  constructor() {
    this.store = new ConfigStore();
  }

  async resolve(configOptions: ConfigOptions): Promise<ResolvedConfig> {
    const [config, secrets] = await Promise.all([
      this.store.readConfig(),
      this.store.readSecrets(),
    ]);

    const { provider, providerConfig } = this.resolveProvider(
      config,
      configOptions,
    );
    const { model, modelConfig } = this.resolveModel(
      providerConfig,
      configOptions,
    );
    const { variant, variantConfig } = this.resolveVariant(
      modelConfig,
      configOptions,
    );

    const sdkProvider = providerConfig.sdkProvider ?? provider;
    const sdkModel = modelConfig.sdkModel ?? model;
    const providerSettings: ProviderSettings =
      providerConfig.providerSettings ?? {};
    const providerSecretOptions: ProviderSecretOptions =
      secrets[provider] ?? {};

    if (configOptions.saveAsCurrent) {
      await this.saveAsCurrent(config, provider, model, variant);
    }

    const generateOptions = merge(
      {},
      config.generateOptions,
      providerConfig.generateOptions,
      modelConfig.generateOptions,
      variantConfig?.generateOptions,
    );

    const languageModel = createLanguageModel({
      sdkProvider,
      sdkModel,
      providerSettings,
      providerSecretOptions,
    });

    return {
      provider,
      model,
      variant,
      sdkProvider,
      sdkModel,
      providerSettings,
      generateOptions,
      languageModel,
    };
  }

  private async saveAsCurrent(
    config: Config,
    provider: string,
    model: string,
    variant: string | null,
  ): Promise<void> {
    const persistedVariant =
      config.providers?.[provider]?.models?.[model]?.currentVariant ?? null;
    // prevent unnecessary config only to set `currentVariant: null`
    const shouldOmitNullVariant = variant === null && persistedVariant === null;

    const patch = {
      currentProvider: provider,
      providers: {
        [provider]: {
          currentModel: model,
          ...(!shouldOmitNullVariant
            ? {
                models: {
                  [model]: {
                    currentVariant: variant,
                  },
                },
              }
            : {}),
        },
      },
    };

    if (!isMatch(config, patch)) {
      const patched = merge({}, config, patch);
      await this.store.writeConfig(patched);
    }
  }

  private resolveProvider(
    config: Config,
    configOptions: ConfigOptions,
  ): { provider: string; providerConfig: ProviderConfig } {
    const provider = configOptions.provider ?? config.currentProvider;
    check(provider, 'provider not specified');
    const providerConfig = config.providers?.[provider] ?? {
      sdkProvider: provider,
    };
    return { provider, providerConfig };
  }

  private resolveModel(
    provider: ProviderConfig,
    configOptions: ConfigOptions,
  ): { model: string; modelConfig: ModelConfig } {
    const model = configOptions.model ?? provider.currentModel;
    check(model, `model not specified`);
    const modelConfig = provider.models?.[model] ?? {
      sdkModel: model,
    };
    return { model, modelConfig };
  }

  private resolveVariant(
    model: ModelConfig,
    configOptions: ConfigOptions,
  ): { variant: string | null; variantConfig: VariantConfig | undefined } {
    const variant =
      configOptions.variant !== undefined
        ? configOptions.variant
        : (model.currentVariant ?? null);
    const variantConfig = variant ? model.variants?.[variant] : undefined;
    if (variant) check(variantConfig, `variant not found: ${variant}`);
    return { variant, variantConfig };
  }
}
