import { z } from 'zod';
import { dateOnlySchema } from './list-deliveries-query.schema';

/**
 * Consulta de tempo por etapa. Mesmo recorte da listagem, sem `status`:
 * filtrar por um status só tornaria a maioria das etapas vazia, já que cada
 * etapa exige as duas pontas registradas.
 */
export const deliveryStageTimesQuerySchema = z
  .object({
    // Recorte operacional exclusivo do administrador; o service tambem valida
    // a permissao para impedir que empresa ou entregador amplie o escopo.
    driverId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial nao pode ser posterior a data final.',
    path: ['from'],
  });

export type DeliveryStageTimesQuery = z.infer<typeof deliveryStageTimesQuerySchema>;
