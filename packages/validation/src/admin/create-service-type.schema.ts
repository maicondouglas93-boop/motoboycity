import { z } from 'zod';

export const createServiceTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Código deve ter pelo menos 2 caracteres.')
    .max(30, 'Código deve ter no máximo 30 caracteres.')
    .regex(/^[A-Z0-9_]+$/, 'Código deve usar apenas letras maiúsculas, números e "_".'),
  name: z
    .string()
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(80, 'Nome deve ter no máximo 80 caracteres.'),
});

export type CreateServiceTypePayload = z.infer<typeof createServiceTypeSchema>;
