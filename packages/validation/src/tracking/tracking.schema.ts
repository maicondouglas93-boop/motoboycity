import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const reportDeliveryLocationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(10_000).optional(),
  // Opcionais para manter APKs antigos compativeis; obrigatorios para detectar chegada.
  sampledAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  speedMps: z.number().finite().min(0).max(200).optional(),
});

export const pickupArrivalEventSchema = z.object({
  deliveryId: z.string().uuid(),
  displayNumber: z.number().int().positive(),
  driverId: z.string().uuid(),
  arrivedAt: z.string().datetime(),
});

export const listDeliveryTrackingQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce.number().int().min(1).max(5_000).default(1_000),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export type ReportDeliveryLocationPayload = z.infer<typeof reportDeliveryLocationSchema>;
export type ListDeliveryTrackingQuery = z.infer<typeof listDeliveryTrackingQuerySchema>;

export const publicDeliveryTrackingTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/, 'Token de rastreamento invalido.');

export type PublicDeliveryTrackingToken = z.infer<typeof publicDeliveryTrackingTokenSchema>;
