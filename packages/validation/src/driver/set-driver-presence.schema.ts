import { z } from 'zod';

export const setDriverPresenceSchema = z.object({
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
});

export type SetDriverPresencePayload = z.infer<typeof setDriverPresenceSchema>;
