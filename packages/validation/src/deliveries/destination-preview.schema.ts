import { z } from 'zod';

/**
 * Consulta de LEITURA: qual rua corresponde à coordenada em que o motoboy está
 * agora, para ele conferir antes de confirmar a entrega.
 *
 * Aqui `lat`/`lng` são obrigatórios, diferente de `markDeliveredSchema`, onde
 * são opcionais porque a obrigatoriedade depende do estado do pedido. Sem
 * coordenada não existe pergunta a fazer.
 */
export const destinationPreviewSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Raio de erro do fix, em metros, como o aparelho reportou. */
  accuracy: z.number().min(0).optional(),
});

export type DestinationPreviewPayload = z.infer<typeof destinationPreviewSchema>;
