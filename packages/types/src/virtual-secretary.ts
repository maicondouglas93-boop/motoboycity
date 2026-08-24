export type VirtualSecretaryMessageRole = 'user' | 'assistant';

export interface VirtualSecretaryHistoryMessage {
  role: VirtualSecretaryMessageRole;
  content: string;
}

export interface VirtualSecretaryChatPayload {
  message: string;
  history?: VirtualSecretaryHistoryMessage[];
}

export interface VirtualSecretaryChatResult {
  requestId: string;
  answer: string;
  toolNames: string[];
  generatedAt: string;
}
