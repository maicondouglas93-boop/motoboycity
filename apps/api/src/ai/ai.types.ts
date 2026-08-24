import type { VirtualSecretaryHistoryMessage } from '@motoboycity/types';

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiToolExecution {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AiAnswerInput {
  message: string;
  history: VirtualSecretaryHistoryMessage[];
  declarations: AiToolDeclaration[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}
