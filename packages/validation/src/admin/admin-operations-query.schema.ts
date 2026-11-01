import { z } from 'zod';

export const adminActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Cursor de data inválido.')
    .optional(),
  regionId: z.string().uuid().optional(),
});

export type AdminActivityQuery = z.infer<typeof adminActivityQuerySchema>;

export const adminSilentDriversQuerySchema = z.object({
  regionId: z.string().uuid().optional(),
});

export type AdminSilentDriversQuery = z.infer<typeof adminSilentDriversQuerySchema>;
