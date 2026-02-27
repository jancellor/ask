import { ConfigReader, type ResolvedConfig } from '../agent/config.js';

export type RunConfigOptions = {
  provider?: string;
  model?: string;
  variant?: string | null;
};

export async function runConfig(options: RunConfigOptions): Promise<void> {
  const resolved = await new ConfigReader().resolve({
    ...options,
    saveAsCurrent: true,
  });
  printResolvedConfig(resolved);
}

function printResolvedConfig(resolved: ResolvedConfig): void {
  const provider =
    resolved.provider === resolved.sdkProvider
      ? resolved.provider
      : `${resolved.provider}=${resolved.sdkProvider}`;
  const model =
    resolved.model === resolved.sdkModel
      ? resolved.model
      : `${resolved.model}=${resolved.sdkModel}`;
  const variant = resolved.variant ?? '';

  console.log(`provider=${provider}`);
  console.log(`model=${model}`);
  console.log(`variant=${variant}`);
  console.log(`providerOptions=${JSON.stringify(resolved.providerOptions)}`);
  console.log(`generateOptions=${JSON.stringify(resolved.generateOptions)}`);
}
