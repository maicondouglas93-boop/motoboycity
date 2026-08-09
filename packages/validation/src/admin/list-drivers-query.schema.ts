import { z } from 'zod';

export const listDriversQuerySchema = z.object({
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  accountStatus: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']).optional(),
});

export type ListDriversQuery = z.infer<typeof listDriversQuerySchema>;
