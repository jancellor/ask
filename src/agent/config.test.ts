import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigReader } from './config.js';
import { ConfigStore } from './config-store.js';

vi.mock('./provider-factories.js', () => ({
  createLanguageModel: vi.fn(() => ({ mocked: true })),
}));

describe('ConfigReader variant handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the saved current variant when variant is undefined', async () => {
    vi.spyOn(ConfigStore.prototype, 'readConfig').mockResolvedValue({
      currentProvider: 'openai',
      providers: {
        openai: {
          currentModel: 'gpt-5',
          models: {
            'gpt-5': {
              currentVariant: 'medium',
              variants: {
                medium: {
                  generateOptions: { reasoning: { effort: 'medium' } },
                },
              },
            },
          },
        },
      },
    });
    vi.spyOn(ConfigStore.prototype, 'readSecrets').mockResolvedValue({});

    const resolved = await new ConfigReader().resolve({ variant: undefined });

    expect(resolved.variant).toBe('medium');
    expect(resolved.generateOptions).toEqual({
      reasoning: { effort: 'medium' },
    });
  });

  it('treats an explicit null variant as clearing the current variant', async () => {
    vi.spyOn(ConfigStore.prototype, 'readConfig').mockResolvedValue({
      currentProvider: 'openai',
      providers: {
        openai: {
          currentModel: 'gpt-5',
          models: {
            'gpt-5': {
              currentVariant: 'balanced',
              variants: {
                balanced: {
                  generateOptions: { reasoning: { effort: 'medium' } },
                },
              },
            },
          },
        },
      },
    });
    vi.spyOn(ConfigStore.prototype, 'readSecrets').mockResolvedValue({});

    const resolved = await new ConfigReader().resolve({ variant: null });

    expect(resolved.variant).toBeNull();
    expect(resolved.generateOptions).toEqual({});
  });

  it('persists a cleared variant when saving current config', async () => {
    const writeConfig = vi
      .spyOn(ConfigStore.prototype, 'writeConfig')
      .mockResolvedValue();
    vi.spyOn(ConfigStore.prototype, 'readConfig').mockResolvedValue({
      currentProvider: 'openai',
      providers: {
        openai: {
          currentModel: 'gpt-5',
          models: {
            'gpt-5': {
              currentVariant: 'balanced',
              variants: {
                balanced: {
                  generateOptions: { reasoning: { effort: 'medium' } },
                },
              },
            },
          },
        },
      },
    });
    vi.spyOn(ConfigStore.prototype, 'readSecrets').mockResolvedValue({});

    await new ConfigReader().resolve({ variant: null, saveAsCurrent: true });

    expect(writeConfig).toHaveBeenCalledWith({
      currentProvider: 'openai',
      providers: {
        openai: {
          currentModel: 'gpt-5',
          models: {
            'gpt-5': {
              currentVariant: null,
              variants: {
                balanced: {
                  generateOptions: { reasoning: { effort: 'medium' } },
                },
              },
            },
          },
        },
      },
    });
  });
});
