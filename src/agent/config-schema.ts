import { z } from 'zod';

export const GenerateOptions = z.record(z.string(), z.unknown());
export const ProviderSettings = z.record(z.string(), z.unknown());
export const ProviderSecretOptions = z.record(z.string(), z.unknown());

export const VariantConfig = z.object({
  generateOptions: GenerateOptions.optional(),
});

export const ModelConfig = z.object({
  sdkModel: z.string().optional(),
  generateOptions: GenerateOptions.optional(),
  currentVariant: z.string().nullable().optional(),
  variants: z.record(z.string(), VariantConfig).optional(),
});

export const ProviderConfig = z.object({
  sdkProvider: z.string().optional(),
  providerSettings: ProviderSettings.optional(),
  generateOptions: GenerateOptions.optional(),
  currentModel: z.string().optional(),
  models: z.record(z.string(), ModelConfig).optional(),
});

export const Config = z.object({
  currentProvider: z.string().optional(),
  generateOptions: GenerateOptions.optional(),
  providers: z.record(z.string(), ProviderConfig).optional(),
});

export const ConfigSecrets = z.record(z.string(), ProviderSecretOptions);

export type GenerateOptions = z.infer<typeof GenerateOptions>;
export type ProviderSettings = z.infer<typeof ProviderSettings>;
export type ProviderSecretOptions = z.infer<typeof ProviderSecretOptions>;
export type Config = z.infer<typeof Config>;
export type ProviderConfig = z.infer<typeof ProviderConfig>;
export type ModelConfig = z.infer<typeof ModelConfig>;
export type VariantConfig = z.infer<typeof VariantConfig>;
export type ConfigSecrets = z.infer<typeof ConfigSecrets>;
