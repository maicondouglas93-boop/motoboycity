import { z } from 'zod';

export const listServiceTypesQuerySchema = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ListServiceTypesQuery = z.infer<typeof listServiceTypesQuerySchema>;
