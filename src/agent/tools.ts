import type { JSONValue, ToolSet } from 'ai';
import { ExecuteTool } from './execute-tool.js';

export class Tools {
  private executeTool = new ExecuteTool();

  definitions(): ToolSet {
    return {
      [this.executeTool.name]: this.executeTool.definition(),
    };
  }

  execute(
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<JSONValue> {
    switch (name) {
      case this.executeTool.name:
        return this.executeTool.execute(args, signal);
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }
}
