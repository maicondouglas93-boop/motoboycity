import { z } from 'zod';

/**
 * Motivo obrigatório em toda intervenção manual do admin.
 *
 * Estas ações são o admin sobrescrevendo o que aconteceu na rua. Sem o motivo
 * gravado, a trilha de auditoria mostra que alguém mudou o pedido e não mostra
 * por quê — que é justamente a pergunta de quem for conferir depois.
 */
const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Descreva o motivo da alteração — ele fica no histórico do pedido.')
  .max(300, 'O motivo pode ter no máximo 300 caracteres.');

export const reassignDriverSchema = z.object({
  driverId: z.uuid('driverId deve ser um UUID válido.'),
  reason: reasonSchema,
});

export const forceCompleteSchema = z.object({
  reason: reasonSchema,
});

/** Coleta/entrega confirmada manualmente pelo administrador. */
export const manualDeliveryStageSchema = z.object({
  reason: reasonSchema,
});

export type ReassignDriverPayload = z.infer<typeof reassignDriverSchema>;
export type ForceCompletePayload = z.infer<typeof forceCompleteSchema>;
export type ManualDeliveryStagePayload = z.infer<typeof manualDeliveryStageSchema>;
