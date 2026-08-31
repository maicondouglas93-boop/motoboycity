import { z } from 'zod';

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe sua senha atual.'),
    newPassword: z
      .string()
      .min(8, 'A nova senha deve ter pelo menos 8 caracteres.')
      .max(128, 'A nova senha deve ter no máximo 128 caracteres.'),
  })
  .strict()
  .refine((payload) => payload.currentPassword !== payload.newPassword, {
    path: ['newPassword'],
    message: 'A nova senha deve ser diferente da senha atual.',
  });

export type ChangeOwnPasswordPayload = z.infer<typeof changeOwnPasswordSchema>;
