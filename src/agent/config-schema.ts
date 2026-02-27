import { z } from 'zod';

export const GenerateOptions = z.record(z.string(), z.unknown());
export const ProviderOptions = z.record(z.string(), z.unknown());
export const ProviderSecretOptions = z.record(z.string(), z.unknown());

export const VariantConfig = z.object({
  options: GenerateOptions.optional(),
});

export const ModelConfig = z.object({
  sdkModel: z.string().optional(),
  options: GenerateOptions.optional(),
  activeVariant: z.string().nullable().optional(),
  variants: z.record(z.string(), VariantConfig).optional(),
});

export const ProviderConfig = z.object({
  sdkProvider: z.string().optional(),
  providerOptions: ProviderOptions.optional(),
  options: GenerateOptions.optional(),
  activeModel: z.string().optional(),
  models: z.record(z.string(), ModelConfig).optional(),
});

export const Config = z.object({
  activeProvider: z.string().optional(),
  options: GenerateOptions.optional(),
  providers: z.record(z.string(), ProviderConfig).optional(),
});

export const ConfigSecrets = z.record(z.string(), ProviderSecretOptions);

export type GenerateOptions = z.infer<typeof GenerateOptions>;
export type ProviderOptions = z.infer<typeof ProviderOptions>;
export type ProviderSecretOptions = z.infer<typeof ProviderSecretOptions>;
export type Config = z.infer<typeof Config>;
export type ProviderConfig = z.infer<typeof ProviderConfig>;
export type ModelConfig = z.infer<typeof ModelConfig>;
export type VariantConfig = z.infer<typeof VariantConfig>;
export type ConfigSecrets = z.infer<typeof ConfigSecrets>;
