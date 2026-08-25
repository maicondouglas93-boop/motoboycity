import { z } from 'zod';

export const administrativeAuditQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  entityType: z
    .enum([
      'COMPANY',
      'COMPANY_MEMBER',
      'COMPANY_ADDRESS',
      'DRIVER',
      'DRIVER_DOCUMENT',
      'DELIVERY',
      'INVOICE',
      'REGION',
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AdministrativeAuditQuery = z.infer<typeof administrativeAuditQuerySchema>;
