import { Agent, type AgentOptions } from './agent/agent.js';
import { extractFinalAssistantText } from './agent/message-utils.js';

export { Agent } from './agent/agent.js';
export { ConfigReader } from './agent/config.js';

export async function ask(
  prompt: string,
  options: AgentOptions = {},
): Promise<string> {
  const agent = await Agent.create(options);
  try {
    const turn = await agent.ask(prompt);
    const messages = await turn.completeMessages();
    return extractFinalAssistantText(messages);
  } finally {
    await agent.close();
  }
}
