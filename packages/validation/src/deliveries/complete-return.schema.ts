import { z } from 'zod';

export const completeReturnSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /**
   * Raio de erro do fix, em metros. Aqui ele decide se a checagem de proximidade
   * significa alguma coisa: com raio de retorno de 200 m e precisao de 800 m, "voltei
   * na loja" passa a ser verdade em qualquer lugar do bairro.
   */
  accuracy: z.number().min(0).optional(),
});

export type CompleteReturnPayload = z.infer<typeof completeReturnSchema>;
