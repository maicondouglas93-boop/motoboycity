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
    /**
     * Descarta entregas com marcacao retroativa.
     *
     * O padrao e INCLUIR: no dia a dia, o horario declarado pelo motoboy e a
     * melhor aproximacao disponivel do que aconteceu, e jogar essas entregas
     * fora encolheria a amostra sem melhorar a medida. Ligar isto e para quando
     * o numero vai virar meta de alguem — ai so serve o que o servidor carimbou.
     */
    excludeRetroactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial nao pode ser posterior a data final.',
    path: ['from'],
  });

export type DeliveryStageTimesQuery = z.infer<typeof deliveryStageTimesQuerySchema>;
