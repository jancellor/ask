import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { createCodexCli } from 'ai-sdk-provider-codex-cli';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { check } from './check.js';
import type {
  ProviderOptions,
  ProviderSecretOptions,
} from './config-schema.js';

export type ProviderFactoryConfig = {
  sdkProvider: string;
  sdkModel: string;
  providerOptions: ProviderOptions;
  providerSecretOptions: ProviderSecretOptions;
};

type SDKProviderFactory = (
  options: Record<string, unknown>,
) => (model: string) => LanguageModel;

const SDK_PROVIDER_FACTORIES: Record<string, SDKProviderFactory> = {
  openai: (options) => createOpenAI(options as any),
  'openai-compatible': (options) => createOpenAICompatible(options as any),
  anthropic: (arg) => createAnthropic(arg as any),
  google: (options) => createGoogleGenerativeAI(options as any),
  'codex-cli': (options) => createCodexCli(options as any),
};

export function createLanguageModel(
  config: ProviderFactoryConfig,
): LanguageModel {
  const providerFactory = SDK_PROVIDER_FACTORIES[config.sdkProvider];
  check(providerFactory, `unsupported provider "${config.sdkProvider}"`);

  return providerFactory({
    ...config.providerOptions,
    ...config.providerSecretOptions,
  })(config.sdkModel);
}
