import { z } from 'zod';

/**
 * Motivo do cancelamento, guardado na nota do historico do pedido.
 *
 * **Opcional, ao contrario do cancelamento de fatura.** A loja cancela pedido
 * pelo aplicativo em segundos, muitas vezes porque o cliente desistiu na hora;
 * exigir texto ali transformaria uma acao corriqueira em formulario. Do lado do
 * admin a tela pede o motivo, porque quem cancela entrega dos outros precisa
 * deixar dito por que.
 *
 * O corpo inteiro tambem e opcional: as telas antigas cancelam sem enviar nada
 * e continuam funcionando.
 */
export const cancelDeliverySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(300, 'O motivo deve ter no máximo 300 caracteres.')
      .optional(),
  })
  /**
   * `.optional().default({})` cobre a requisicao SEM CORPO NENHUM.
   *
   * Sem isto, todo cancelamento antigo — que manda apenas o PATCH — passa a
   * responder 400. O e2e pegou; os testes de unidade nao, porque chamam o
   * service direto e nunca atravessam o pipe de validacao.
   */
  .optional()
  .default({});

export type CancelDeliveryPayload = z.infer<typeof cancelDeliverySchema>;
