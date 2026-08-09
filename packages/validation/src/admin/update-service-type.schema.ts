import { z } from 'zod';

export const updateServiceTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.active !== undefined, {
    message: 'Informe ao menos um campo para atualizar (name ou active).',
  });

export type UpdateServiceTypePayload = z.infer<typeof updateServiceTypeSchema>;
