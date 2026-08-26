import { z } from 'zod';
import { dateOnlySchema } from './list-deliveries-query.schema';

export const deliverySummaryQuerySchema = z
  .object({
    // O service repete a autorizacao: esses recortes explicitos sao apenas
    // administrativos, enquanto empresa e motoboy continuam no proprio escopo.
    driverId: z.uuid().optional(),
    companyId: z.uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial nao pode ser posterior a data final.',
    path: ['from'],
  });

export type DeliverySummaryQuery = z.infer<typeof deliverySummaryQuerySchema>;
