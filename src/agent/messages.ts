import type { ModelMessage } from 'ai';

export type AskMessageMeta = {
  id: string;
  parentId: string | null;
  uiHidden?: boolean;
  timestamp?: string;
};

export type AskMessage = ModelMessage & { _meta: AskMessageMeta };
