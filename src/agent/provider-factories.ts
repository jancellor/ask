import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { createCodexCli } from 'ai-sdk-provider-codex-cli';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { check } from './check.js';
import type {
  ProviderSettings,
  ProviderSecretOptions,
} from './config-schema.js';
import { createOpenAISubscriptionFetch } from './openai-subscription-fetch.js';

export type ProviderFactoryConfig = {
  sdkProvider: string;
  sdkModel: string;
  providerSettings: ProviderSettings;
  providerSecretOptions: ProviderSecretOptions;
};

const OPENAI_SUBSCRIPTION_DUMMY_API_KEY = 'subscription-oauth';

type SDKProviderFactory = (
  options: Record<string, unknown>,
) => (model: string) => LanguageModel;

const SDK_PROVIDER_FACTORIES: Record<string, SDKProviderFactory> = {
  openai: (options) => createOpenAI(options as any),
  'openai-subscription': (options) => createOpenAI(options as any),
  'openai-compatible': (options) => createOpenAICompatible(options as any),
  anthropic: (arg) => createAnthropic(arg as any),
  google: (options) => createGoogleGenerativeAI(options as any),
  'codex-cli': (options) => createCodexCli(options as any),
};

function maybeEnableOpenAISubscriptionFetch(
  sdkProvider: string,
  options: Record<string, unknown>,
) {
  if (sdkProvider !== 'openai-subscription' || options.fetch) {
    return options;
  }

  return {
    ...options,
    apiKey:
      typeof options.apiKey === 'string' && options.apiKey.length > 0
        ? options.apiKey
        : OPENAI_SUBSCRIPTION_DUMMY_API_KEY,
    fetch: createOpenAISubscriptionFetch(),
  };
}

export function createLanguageModel(
  config: ProviderFactoryConfig,
): LanguageModel {
  const providerFactory = SDK_PROVIDER_FACTORIES[config.sdkProvider];
  check(providerFactory, `unsupported provider "${config.sdkProvider}"`);

  return providerFactory(
    maybeEnableOpenAISubscriptionFetch(config.sdkProvider, {
      ...config.providerSettings,
      ...config.providerSecretOptions,
    }),
  )(config.sdkModel);
}
