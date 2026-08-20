import { z } from 'zod';

export const driverLiveLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(2_000).optional(),
});

export const setDriverPresenceSchema = z.discriminatedUnion('availability', [
  z.object({
    availability: z.literal('AVAILABLE'),
    location: driverLiveLocationSchema,
    appVersion: z.string().trim().min(1).max(32),
    trackingCapability: z.literal('BACKGROUND_V1'),
  }),
  z.object({ availability: z.literal('UNAVAILABLE') }),
]);

export const driverPresenceHeartbeatSchema = driverLiveLocationSchema.extend({
  appVersion: z.string().trim().min(1).max(32),
});

export type SetDriverPresencePayload = z.infer<typeof setDriverPresenceSchema>;
export type DriverPresenceHeartbeatPayload = z.infer<typeof driverPresenceHeartbeatSchema>;
