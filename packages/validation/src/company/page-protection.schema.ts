import { z } from 'zod';

export const protectablePageRouteSchema = z.enum([
  'FINANCEIRO',
  'RELATORIOS',
  'PEDIDOS',
  'CLIENTES',
]);

export const setPageProtectionSchema = z.object({
  routeKey: protectablePageRouteSchema,
  password: z
    .string()
    .min(4, 'A senha deve ter no mínimo 4 caracteres.')
    .max(64, 'A senha deve ter no máximo 64 caracteres.'),
});

export const updatePageProtectionSchema = z
  .object({
    password: z
      .string()
      .min(4, 'A senha deve ter no mínimo 4 caracteres.')
      .max(64, 'A senha deve ter no máximo 64 caracteres.')
      .optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => data.password !== undefined || data.enabled !== undefined,
    {
      message: 'Informe a nova senha ou altere o status da proteção.',
    },
  );

export const verifyPagePasswordSchema = z.object({
  routeKey: protectablePageRouteSchema,
  password: z.string().min(1, 'Informe a senha.'),
});

export type SetPageProtectionInput = z.infer<typeof setPageProtectionSchema>;
export type UpdatePageProtectionInput = z.infer<typeof updatePageProtectionSchema>;
export type VerifyPagePasswordInput = z.infer<typeof verifyPagePasswordSchema>;
