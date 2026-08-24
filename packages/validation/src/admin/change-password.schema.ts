import { z } from 'zod';

/** Redefinicao administrativa: a confirmacao existe apenas no formulario. */
export const changeAdminPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'A senha deve ter pelo menos 8 caracteres.')
      .max(128, 'A senha deve ter no maximo 128 caracteres.'),
  })
  .strict();

export type ChangeAdminPasswordPayload = z.infer<typeof changeAdminPasswordSchema>;
