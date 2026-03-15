import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  openAIFactory,
  openAICompatibleFactory,
  subscriptionFetch,
  createOpenAISubscriptionFetch,
} = vi.hoisted(() => ({
  openAIFactory: vi.fn((options: Record<string, unknown>) => {
    const modelFactory = vi.fn((model: string) => ({
      provider: 'openai',
      model,
      options,
    }));
    return modelFactory;
  }),
  openAICompatibleFactory: vi.fn((options: Record<string, unknown>) => {
    const modelFactory = vi.fn((model: string) => ({
      provider: 'openai-compatible',
      model,
      options,
    }));
    return modelFactory;
  }),
  subscriptionFetch: vi.fn(),
  createOpenAISubscriptionFetch: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openAIFactory,
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: openAICompatibleFactory,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(),
}));

vi.mock('ai-sdk-provider-codex-cli', () => ({
  createCodexCli: vi.fn(),
}));

vi.mock('./openai-subscription-fetch.js', () => ({
  createOpenAISubscriptionFetch,
}));

import { createLanguageModel } from './provider-factories.js';

describe('createLanguageModel', () => {
  beforeEach(() => {
    openAIFactory.mockClear();
    openAICompatibleFactory.mockClear();
    subscriptionFetch.mockClear();
    createOpenAISubscriptionFetch.mockReset();
    createOpenAISubscriptionFetch.mockReturnValue(subscriptionFetch);
  });

  it('injects the subscription fetch for openai-subscription', () => {
    const model = createLanguageModel({
      sdkProvider: 'openai-subscription',
      sdkModel: 'gpt-5',
      providerSettings: { baseURL: 'https://api.openai.com/v1' },
      providerSecretOptions: {},
    });

    expect(model).toEqual({
      provider: 'openai',
      model: 'gpt-5',
      options: expect.objectContaining({
        baseURL: 'https://api.openai.com/v1',
        fetch: subscriptionFetch,
      }),
    });
  });

  it('does not inject the subscription fetch for normal openai', () => {
    createLanguageModel({
      sdkProvider: 'openai',
      sdkModel: 'gpt-5',
      providerSettings: {},
      providerSecretOptions: {},
    });

    expect(openAIFactory).toHaveBeenCalledWith(
      expect.not.objectContaining({
        fetch: expect.any(Function),
      }),
    );
  });

  it('does not inject the subscription fetch for openai-compatible', () => {
    const model = createLanguageModel({
      sdkProvider: 'openai-compatible',
      sdkModel: 'gpt-5',
      providerSettings: { baseURL: 'https://api.openai.com/v1' },
      providerSecretOptions: {},
    });

    expect(model).toEqual({
      provider: 'openai-compatible',
      model: 'gpt-5',
      options: expect.objectContaining({
        baseURL: 'https://api.openai.com/v1',
      }),
    });
    expect(openAICompatibleFactory).toHaveBeenCalledWith(
      expect.not.objectContaining({
        fetch: expect.any(Function),
      }),
    );
  });
});
