import { z } from 'zod';

export const adminRegionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  maxDeliveryDistanceKm: z.number().positive().max(9999).nullable(),
});

export type AdminRegionPayload = z.infer<typeof adminRegionSchema>;
