import { z } from 'zod';

export const reofferDeliverySchema = z.object({
  driverId: z.uuid('driverId deve ser um UUID valido.'),
  reason: z
    .string()
    .trim()
    .min(5, 'Descreva por que a oferta sera reenviada.')
    .max(300, 'O motivo pode ter no maximo 300 caracteres.'),
});

export type ReofferDeliveryPayload = z.infer<typeof reofferDeliverySchema>;
