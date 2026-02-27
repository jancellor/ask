# Config Spec

This document defines the runtime configuration format for model/provider selection and option resolution.

## Goals

- Keep the config structure symmetric and easy to reason about.
- Map cleanly to Vercel AI SDK `generateText` call settings.
- Support provider/model/variant defaults with clear override order.
- Allow multiple configured providers to map to one AI SDK provider family (for example `openai-compatible`).
- Keep authentication separate from behavior config.

## Terminology

- `provider`: A configured provider entry in this file (for example `anthropic`, `local-ollama`).
- `sdkProvider`: Optional override for the underlying AI SDK provider family.
  - If omitted, defaults to the provider object key.
  - Example: provider key `local-ollama` with `sdkProvider: "openai-compatible"`.
- `model`: AI SDK model identifier (the model object key).
- `variant`: Optional named option profile under a model.

## Shape

```ts
export type Config = {
  currentProvider?: string;

  // Global defaults.
  generateOptions?: GenerateTextOptions;

  providers?: Record<string, ProviderConfig>;
};

export type ProviderConfig = {
  // Optional AI SDK provider family name.
  // Defaults to this provider's key when omitted.
  sdkProvider?: string;

  // Passed through directly to the AI SDK provider factory.
  // Runtime merges provider secret options on top before creating the provider.
  providerOptions?: Record<string, unknown>;
  generateOptions?: GenerateTextOptions;

  currentModel?: string;
  models?: Record<string, ModelConfig>;
};

export type ModelConfig = {
  // Per-model defaults.
  generateOptions?: GenerateTextOptions;

  // Optional current variant. Undefined means no variant selected.
  currentVariant?: string;

  // Optional variant profiles.
  variants?: Record<string, VariantConfig>;
};

export type VariantConfig = {
  generateOptions?: GenerateTextOptions;
};

// Intentionally broad; this should mirror AI SDK generateText call settings
// used by the app, including providerOptions.
export type GenerateTextOptions = Record<string, unknown>;
```

## Auth File

Authentication is stored separately from `config.json` in an adjacent `config.secrets.json`.

```ts
export type ProviderSecretOptions = Record<string, unknown>;
export type ConfigSecrets = Record<string, ProviderSecretOptions>;
```

- Both `config.json` and `config.secrets.json` are optional at startup.
- Secret entries are mapped by configured provider name.
- Example: entry `anthropic` in `config.secrets.json` is used for `providers.anthropic`.
- Environment-variable key lookup is not supported in this spec.
- If a selected provider has no entry in `config.secrets.json`, runtime does not inject secret options.
- At runtime, selected `providerSecretOptions` are merged into provider factory options after `providerOptions`.

## Example

```json
{
  "currentProvider": "anthropic",
  "generateOptions": {
    "temperature": 0.2,
    "maxOutputTokens": 1200
  },
  "providers": {
    "anthropic": {
      "currentModel": "claude-sonnet-4",
      "generateOptions": {
        "maxOutputTokens": 1600
      },
      "models": {
        "claude-sonnet-4": {
          "currentVariant": "balanced",
          "generateOptions": {},
          "variants": {
            "fast": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "thinking": {
                      "type": "enabled",
                      "budgetTokens": 1024
                    }
                  }
                }
              }
            },
            "balanced": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "thinking": {
                      "type": "enabled",
                      "budgetTokens": 4096
                    }
                  }
                }
              }
            },
            "deep": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "thinking": {
                      "type": "enabled",
                      "budgetTokens": 8192
                    }
                  }
                }
              }
            }
          }
        },
        "claude-opus-4": {
          "currentVariant": "high",
          "generateOptions": {},
          "variants": {
            "medium": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "thinking": {
                      "type": "enabled",
                      "budgetTokens": 4096
                    }
                  }
                }
              }
            },
            "high": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "thinking": {
                      "type": "enabled",
                      "budgetTokens": 12288
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "openai": {
      "currentModel": "gpt-5",
      "models": {
        "gpt-5": {
          "currentVariant": "medium",
          "generateOptions": {},
          "variants": {
            "low": {
              "generateOptions": {
                "providerOptions": {
                  "openai": {
                    "reasoningEffort": "low"
                  }
                }
              }
            },
            "medium": {
              "generateOptions": {
                "providerOptions": {
                  "openai": {
                    "reasoningEffort": "medium"
                  }
                }
              }
            },
            "high": {
              "generateOptions": {
                "providerOptions": {
                  "openai": {
                    "reasoningEffort": "high"
                  }
                }
              }
            }
          }
        }
      }
    },
    "local-ollama": {
      "sdkProvider": "openai-compatible",
      "providerOptions": {
        "name": "local-ollama",
        "baseURL": "http://localhost:11434/v1"
      },
      "currentModel": "llama3.1:70b",
      "models": {
        "llama3.1:70b": {
          "currentVariant": "default",
          "generateOptions": {
            "temperature": 0.7,
            "maxOutputTokens": 800
          },
          "variants": {
            "default": {
              "generateOptions": {}
            }
          }
        }
      }
    }
  }
}
```

Example `config.secrets.json`:

```json
{
  "anthropic": {
    "apiKey": "sk-ant-..."
  },
  "openai": {
    "apiKey": "sk-..."
  },
  "local-ollama": {
    "apiKey": "local-token-or-placeholder"
  }
}
```

## Option Merge Order

Effective call settings are created by deep merge in this exact order:

1. Root `generateOptions`
2. `provider.generateOptions`
3. `model.generateOptions`
4. `variant.generateOptions` (if `currentVariant` is defined and exists)
5. CLI overrides

Later entries override earlier entries.

## CLI Selection and Set Behavior

Selection flags:

- `-p`, `--provider`
- `-m`, `--model`
- `-v`, `--variant`
- `-c`, `--config`

Resolution rules:

1. Any omitted selection uses the current configured value from config.
2. If any of provider/model/variant cannot be resolved after fallback to current values, command must error.
3. In `-c` / `--config` mode, providing any of `-p` / `-m` / `-v` persists those values back to current config.
4. Outside `-c` / `--config` mode, CLI selection changes are run-local only and do not update current values.

## Notes

- `currentVariant` is optional (`undefined` means variant layer is skipped).
- `variants` is optional; models can be used without variants.
- Prefer deep merge semantics for nested objects like `providerOptions`.
- Config writes should be atomic and skipped when content would be unchanged.
- `config.secrets.json` should be written with restrictive permissions (for example `0600`).
