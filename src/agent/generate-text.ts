import {
  streamText,
  type ModelMessage,
  type ToolSet,
  type TypedToolCall,
} from 'ai';

export type GenerateTextResult<TOOLS extends ToolSet> = {
  response: { messages: ModelMessage[] };
  toolCalls: Array<TypedToolCall<TOOLS>>;
};

type ProviderOptions = {
  openai?: {
    include?: string[];
    instructions?: string;
    parallelToolCalls?: boolean;
    reasoningEffort?: string;
    reasoningSummary?: string;
    store?: boolean;
    systemMessageMode?: 'remove' | 'system' | 'developer';
  };
};

export async function generateText<TOOLS extends ToolSet>(options: {
  model: unknown;
  sdkProvider: string;
  system: string;
  messages: ModelMessage[];
  tools: TOOLS;
  abortSignal: AbortSignal;
  providerOptions?: ProviderOptions;
  [key: string]: unknown;
}): Promise<GenerateTextResult<TOOLS>> {
  const {
    sdkProvider,
    system,
    tools,
    messages,
    providerOptions,
    ...callOptions
  } = options;
  const isOpenAISubscription = sdkProvider === 'openai-subscription';
  const rewrittenProviderOptions = isOpenAISubscription
    ? {
        ...providerOptions,
        openai: {
          reasoningEffort: 'medium',
          reasoningSummary: 'auto',
          ...providerOptions?.openai,
          instructions: system,
          systemMessageMode: 'remove',
          store: false,
          parallelToolCalls: true,
        },
      }
    : providerOptions;

  const result = streamText({
    ...callOptions,
    messages,
    tools,
    ...(isOpenAISubscription ? {} : { system }),
    providerOptions: rewrittenProviderOptions,
  } as any);

  for await (const part of result.fullStream) {
    if (part.type === 'error' || part.type === 'tool-error') {
      throw part.error instanceof Error
        ? part.error
        : new Error(String(part.error));
    }
  }

  const [response, toolCalls] = await Promise.all([
    result.response,
    result.toolCalls,
  ]);

  return {
    response: {
      messages: response.messages,
    },
    toolCalls,
  };
}
