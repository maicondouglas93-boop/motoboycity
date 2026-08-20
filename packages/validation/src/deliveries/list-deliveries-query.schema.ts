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

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const listDeliveriesQuerySchema = z
  .object({
    status: z.enum(deliveryStatusValues).optional(),
    // Recorte operacional exclusivo do administrador. O service tambem valida
    // a permissao para impedir que empresa ou entregador amplie o proprio escopo.
    driverId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial nao pode ser posterior a data final.',
    path: ['from'],
  });

export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;
