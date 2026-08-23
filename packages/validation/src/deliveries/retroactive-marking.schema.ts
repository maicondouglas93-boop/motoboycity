import { z } from 'zod';

/**
 * Horario declarado numa marcacao retroativa — o motoboy esqueceu de tocar o
 * botao e informa depois a que horas a etapa aconteceu.
 *
 * Aqui so se valida a FORMA. Se o horario cabe na janela permitida (nao no
 * futuro, nao antes da etapa anterior, respeitando o intervalo minimo) depende
 * do historico do pedido e da configuracao da operacao, entao e o servico que
 * decide — o mesmo criterio que ja separa este schema do `markDelivered`.
 */
export const occurredAtSchema = z.iso.datetime({
  message: 'Informe o horário no formato ISO 8601, com fuso.',
});

export const markCollectedSchema = z
  .object({
    occurredAt: occurredAtSchema.optional(),
  })
  /**
   * Corpo ausente vira objeto vazio.
   *
   * A coleta normal — a esmagadora maioria — e um PATCH sem corpo nenhum, e ai
   * o `@Body()` do Nest entrega `undefined`, nao `{}`. Sem este default,
   * acrescentar um campo OPCIONAL passaria a exigir corpo e quebraria toda
   * coleta feita na hora, com 400 e sem nenhuma pista do motivo.
   */
  .default({});

export type MarkCollectedPayload = z.infer<typeof markCollectedSchema>;
