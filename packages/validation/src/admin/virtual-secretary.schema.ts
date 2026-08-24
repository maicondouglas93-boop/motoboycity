import { z } from 'zod';

const virtualSecretaryHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4_000),
});

export const virtualSecretaryChatSchema = z.object({
  message: z.string().trim().min(1, 'Digite uma pergunta.').max(2_000),
  history: z.array(virtualSecretaryHistoryMessageSchema).max(8).default([]),
});

export type VirtualSecretaryChatPayload = z.infer<typeof virtualSecretaryChatSchema>;
