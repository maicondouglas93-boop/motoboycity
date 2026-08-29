import { z } from 'zod';
import { deliveryFailureReasonValues } from '../deliveries/mark-failed.schema';

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
  /**
   * Distância da entrega, obrigatória SOMENTE quando o pedido calcularia o
   * preço pela localização do motoboy e essa localização nunca chegou.
   *
   * Existe porque esses pedidos podiam ficar presos em COLLECTED para sempre:
   * o aplicativo não conseguia concluir e o painel recusava a conclusão por
   * falta de preço. Sem distância não há preço, e inventar um seria pagar o
   * motoboy e cobrar a empresa por um número que ninguém mediu — então o
   * administrador informa o valor, ele fica no histórico junto com o motivo, e
   * o preço sai da tabela vigente como em qualquer outra entrega.
   */
  distanceKm: z
    .number()
    .positive('A distância precisa ser maior que zero.')
    .max(300, 'A distância deve ser de no máximo 300 km.')
    .optional(),
});

/**
 * Insucesso registrado pelo administrador.
 *
 * Existe porque o insucesso do motoboy depende de GPS e de uma rota do Google
 * quando o pedido calcula o preco na entrega. Falhando qualquer um dos dois, ele
 * ficava com a mercadoria na mao e o pedido preso em COLLECTED — sem acao para
 * ele NEM para o painel, que era o unico estado sem saida do ciclo.
 *
 * `distanceKm` segue a mesma regra da entrega manual: obrigatorio so quando o
 * pedido calcularia o preco pela localizacao e ela nunca chegou; recusado
 * quando o valor ja esta congelado.
 */
export const adminMarkFailedSchema = z.object({
  reason: reasonSchema,
  failureReason: z.enum(deliveryFailureReasonValues, {
    message: 'Informe um motivo válido para o insucesso.',
  }),
  note: z.string().trim().max(500, 'A observação deve ter no máximo 500 caracteres.').optional(),
  distanceKm: z
    .number()
    .positive('A distância precisa ser maior que zero.')
    .max(300, 'A distância deve ser de no máximo 300 km.')
    .optional(),
});

export type AdminMarkFailedPayload = z.infer<typeof adminMarkFailedSchema>;
export type ReassignDriverPayload = z.infer<typeof reassignDriverSchema>;
export type ForceCompletePayload = z.infer<typeof forceCompleteSchema>;
export type ManualDeliveryStagePayload = z.infer<typeof manualDeliveryStageSchema>;
