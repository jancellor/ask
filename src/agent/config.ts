import type { LanguageModel } from 'ai';
import { isMatch, merge } from 'lodash-es';
import { check } from './check.js';
import {
  type Config,
  type GenerateOptions,
  type ModelConfig,
  type ProviderOptions,
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
  setActive?: boolean;
};

export type ResolvedConfig = {
  provider: string;
  model: string;
  variant: string | null;
  sdkProvider: string;
  sdkModel: string;
  providerOptions: ProviderOptions;
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
    const providerOptions: ProviderOptions = providerConfig.providerOptions ?? {};
    const providerSecretOptions: ProviderSecretOptions = secrets[provider] ?? {};

    if (configOptions.setActive) {
      await this.saveActiveConfig(config, provider, model, variant);
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
      providerOptions,
      providerSecretOptions,
    });

    return {
      provider,
      model,
      variant,
      sdkProvider,
      sdkModel,
      providerOptions,
      generateOptions,
      languageModel,
    };
  }

  private async saveActiveConfig(
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

    if (!isMatch(config, patch)) {
      const patched = merge({}, config, patch);
      await this.store.writeConfig(patched);
    }
  }

  private resolveProvider(
    config: Config,
    configOptions: ConfigOptions,
  ): { provider: string; providerConfig: ProviderConfig } {
    const provider = configOptions.provider ?? config.activeProvider;
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
    const model = configOptions.model ?? provider.activeModel;
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
    const variant = configOptions.variant ?? model.activeVariant ?? null;
    const variantConfig = variant ? model.variants?.[variant] : undefined;
    if (variant) check(variantConfig, `variant not found: ${variant}`);
    return { variant, variantConfig };
  }
}
