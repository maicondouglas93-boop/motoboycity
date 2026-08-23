import { z } from 'zod';

/**
 * O motoboy devolve a fila um pedido que aceitou e nao vai conseguir entregar
 * — moto quebrou, a loja nao tinha o produto, ele passou mal.
 *
 * O motivo e obrigatorio porque esta e a unica acao em que o pedido anda para
 * TRAS na maquina de estados. Sem ele, a loja ve o pedido voltar para
 * "procurando motoboy" sem explicacao nenhuma, e o admin nao tem como
 * distinguir moto quebrada de motoboy escolhendo corrida.
 */
export const returnToQueueSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Descreva o motivo — ele fica no histórico do pedido.')
    .max(300, 'O motivo pode ter no máximo 300 caracteres.'),
});

export type ReturnToQueuePayload = z.infer<typeof returnToQueueSchema>;
