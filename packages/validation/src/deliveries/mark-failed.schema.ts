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
 * lat/lng registram ONDE a tentativa aconteceu. Nao definem preco (diferente
 * de `markDelivered` em modo GPS), mas sao a unica prova de que o motoboy
 * chegou ao destino antes de declarar insucesso — sem isso, "nao consegui
 * entregar" seria indistinguivel de "nao fui".
 */
export const markFailedSchema = z
  .object({
    reason: z.enum(deliveryFailureReasonValues, {
      message: 'Informe um motivo válido para o insucesso.',
    }),
    note: z.string().trim().max(500, 'A observação deve ter no máximo 500 caracteres.').optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional(),
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
