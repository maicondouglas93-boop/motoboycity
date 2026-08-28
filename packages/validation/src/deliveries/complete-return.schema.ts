import { z } from 'zod';

/**
 * A localizacao continua opcional no contrato porque o ADM pode deixar a
 * validacao desligada. Quando ha raio configurado, o service exige coordenada
 * e precisao do fix antes de concluir o retorno.
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
