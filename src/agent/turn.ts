import type { AskMessage } from './message-utils.js';

export interface Turn {
  id: string;
  messageEvents(): AsyncIterable<AskMessage>;
  completeMessages(): Promise<AskMessage[]>; // rename to make clear same data as messageEvents
  cancel(): Promise<void>; // consider removing - just graph.cancel and agent.cancel?
}
