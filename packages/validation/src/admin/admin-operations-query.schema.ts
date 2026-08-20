import { z } from 'zod';

export const adminActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Cursor de data inválido.')
    .optional(),
});

export type AdminActivityQuery = z.infer<typeof adminActivityQuerySchema>;
