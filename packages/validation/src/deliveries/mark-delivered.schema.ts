import { z } from 'zod';

/**
 * lat/lng são obrigatórios só quando a entrega está em modo
 * destinationKnownAtCreation=false — isso depende de estado do banco, não é
 * checado aqui; o service valida a obrigatoriedade condicional.
 */
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
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe lat e lng juntos, ou nenhum dos dois.',
    path: ['lat'],
  });

export type MarkDeliveredPayload = z.infer<typeof markDeliveredSchema>;
