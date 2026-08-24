import { z } from 'zod';

export const listPricingTablesQuerySchema = z.object({
  serviceTypeId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ListPricingTablesQuery = z.infer<typeof listPricingTablesQuerySchema>;
