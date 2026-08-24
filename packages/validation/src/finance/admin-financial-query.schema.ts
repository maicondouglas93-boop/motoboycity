import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const adminFinancialOverviewQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

/**
 * Extrato de recebimentos: o que entrou, e quando.
 *
 * `from` e `to` sao obrigatorios, ao contrario do resumo por periodo. Extrato
 * sem recorte devolveria a operacao inteira desde o primeiro dia — cresce sem
 * limite e nunca e o que alguem quer ver.
 */
export const listReceiptsQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    /** Somente faturas quitadas online, para conferir contra o extrato bancario. */
    onlineOnly: z.coerce.boolean().optional().default(false),
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export const listAdminWalletsQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AdminFinancialOverviewQuery = z.infer<typeof adminFinancialOverviewQuerySchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
export type ListAdminWalletsQuery = z.infer<typeof listAdminWalletsQuerySchema>;
