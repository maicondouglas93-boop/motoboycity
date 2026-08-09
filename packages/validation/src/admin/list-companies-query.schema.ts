import { z } from 'zod';

export const listCompaniesQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']).optional(),
});

export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
