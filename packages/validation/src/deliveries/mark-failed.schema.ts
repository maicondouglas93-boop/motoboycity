import { z } from 'zod';

export const deliveryFailureReasonValues = [
  'RECIPIENT_ABSENT',
  'ADDRESS_NOT_FOUND',
  'RECIPIENT_REFUSED',
  'OTHER',
] as const;

/**
 * Insucesso de entrega: o motoboy coletou mas nao conseguiu entregar.
 *
 * Nao e cancelamento — a mercadoria volta para a loja e a empresa paga a
 * corrida normal, entao o pedido fecha pela mesma confirmacao de retorno que
 * uma entrega bem-sucedida com `requiresReturn`.
 *
 * lat/lng podem registrar onde a tentativa aconteceu, mas são opcionais: uma
 * falha de GPS não pode impedir o motoboy de informar o problema.
 */
export const markFailedSchema = z
  .object({
    reason: z.enum(deliveryFailureReasonValues, {
      message: 'Informe um motivo válido para o insucesso.',
    }),
    note: z.string().trim().max(500, 'A observação deve ter no máximo 500 caracteres.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe lat e lng juntos, ou nenhum dos dois.',
    path: ['lat'],
  })
  /**
   * "Outro" sem explicacao nao serve para nada: quem for analisar o relatorio
   * de insucessos precisa saber o que aconteceu.
   */
  .refine((data) => data.reason !== 'OTHER' || (data.note && data.note.length > 0), {
    message: 'Descreva o que aconteceu quando o motivo for "Outro".',
    path: ['note'],
  });

export type MarkFailedPayload = z.infer<typeof markFailedSchema>;
export type DeliveryFailureReason = (typeof deliveryFailureReasonValues)[number];
