import { z } from 'zod';

export const deliveryStatusValues = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'AWAITING_PAYMENT',
] as const;

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(deliveryStatusValues).optional(),
});

export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;
