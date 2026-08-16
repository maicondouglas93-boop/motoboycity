import { z } from 'zod';

export const replaceDriverServiceTypesSchema = z.object({
  serviceTypeIds: z
    .array(z.string().uuid('Cada modalidade deve ter um ID válido.'))
    .min(1, 'Selecione pelo menos uma modalidade para o entregador.')
    .max(20, 'Um entregador pode ter no máximo 20 modalidades.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Uma modalidade não pode ser informada mais de uma vez.',
    }),
});

export type ReplaceDriverServiceTypesPayload = z.infer<typeof replaceDriverServiceTypesSchema>;
