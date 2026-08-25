import { z } from 'zod';

/**
 * A localização é opcional e serve apenas como contexto de auditoria. A
 * confirmação do retorno não depende de GPS ou proximidade.
 */
export const completeReturnSchema = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe lat e lng juntos, ou nenhum dos dois.',
    path: ['lat'],
  })
  .optional()
  .default({});

export type CompleteReturnPayload = z.infer<typeof completeReturnSchema>;
