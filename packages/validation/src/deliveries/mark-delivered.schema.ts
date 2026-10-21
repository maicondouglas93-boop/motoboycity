import { z } from 'zod';
import { occurredAtSchema } from './retroactive-marking.schema';

/**
 * lat/lng são obrigatórios só quando a entrega está em modo
 * destinationKnownAtCreation=false — isso depende de estado do banco, não é
 * checado aqui; o service valida a obrigatoriedade condicional.
 */

/** Acima disso é erro de digitação, não o dinheiro de uma entrega. */
export const MAX_DINHEIRO_A_DEVOLVER = 10_000;

export const markDeliveredSchema = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /**
     * Raio de erro do fix, em metros, como o aparelho reportou.
     *
     * Nesta entrega a coordenada DEFINE o destino e o preco. Sem saber a precisao, o
     * servidor nao tem como distinguir um GPS travado no satelite de uma triangulacao
     * de antena com centenas de metros de erro — e as duas viram distancia e valor
     * cobrados. O app manda o que o aparelho reportar; quem decide se serve e o
     * servico, que tem o limite.
     */
    accuracy: z.number().min(0).optional(),
    /**
     * Marcacao retroativa: o motoboy esqueceu de tocar na hora e informa a que
     * horas entregou. Opcional — a esmagadora maioria das entregas e marcada no
     * momento, e ai o relogio que vale e o do servidor.
     */
    occurredAt: occurredAtSchema.optional(),
    /**
     * Dinheiro que o motoboy recebeu do cliente e vai devolver à loja, na
     * entrega com retorno; 0 = não recebeu dinheiro (cartão, Pix, já pago).
     * Opcional porque o aplicativo antigo não manda — o novo sempre pergunta.
     * Em entrega sem retorno o serviço ignora o campo.
     */
    cashToReturn: z
      .number()
      .min(0, 'O valor a devolver não pode ser negativo.')
      .max(MAX_DINHEIRO_A_DEVOLVER, 'Confira o valor a devolver: está alto demais.')
      .refine(
        (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
        'Informe o valor a devolver em reais e centavos.',
      )
      .optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe lat e lng juntos, ou nenhum dos dois.',
    path: ['lat'],
  });

export type MarkDeliveredPayload = z.infer<typeof markDeliveredSchema>;
