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
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe lat e lng juntos, ou nenhum dos dois.',
    path: ['lat'],
  });

export type MarkDeliveredPayload = z.infer<typeof markDeliveredSchema>;
