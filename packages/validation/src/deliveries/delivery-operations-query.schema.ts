import { z } from 'zod';
import { deliveryStatusValues } from './list-deliveries-query.schema';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const deliveryOperationsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  statuses: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(deliveryStatusValues)).max(deliveryStatusValues.length))
    .optional(),
  companyId: z.uuid().optional(),
  driverId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  deliveryId: z.uuid().optional(),
});

export const searchDeliveriesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(deliveryStatusValues).optional(),
    companyId: z.uuid().optional(),
    driverId: z.uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export type DeliveryOperationsQuery = z.infer<typeof deliveryOperationsQuerySchema>;
export type SearchDeliveriesQuery = z.infer<typeof searchDeliveriesQuerySchema>;

/** Consulta financeira administrativa; não modifica o contrato da busca operacional. */
export const adminOrderReportQuerySchema = searchDeliveriesQuerySchema.safeExtend({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  dateField: z.enum(['CREATED', 'COMPLETED']).default('CREATED'),
  financialStatus: z.enum(['ALL', 'OPEN', 'UNBILLED', 'PENDING', 'OVERDUE', 'PAID']).default('ALL'),
});
export type AdminOrderReportQuery = z.infer<typeof adminOrderReportQuerySchema>;
