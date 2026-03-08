import { Agent, type AgentOptions } from './agent/agent.js';

export { Agent } from './agent/agent.js';
export { ConfigReader } from './agent/config.js';

export async function ask(
  message: string,
  options: AgentOptions = {},
): Promise<string> {
  const agent = await Agent.create(options);
  return await agent.ask(message);
}
