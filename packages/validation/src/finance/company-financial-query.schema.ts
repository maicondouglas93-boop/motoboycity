import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

function civilDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/**
 * Gasto da loja por periodo.
 *
 * Intervalo obrigatorio e limitado a 366 dias pelo mesmo motivo do
 * demonstrativo do admin: uma consulta sem recorte varreria todo o historico
 * da empresa, e nunca e isso que alguem quer ver.
 */
export const companyFinancialSummaryQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  })
  .refine((data) => civilDayNumber(data.to) - civilDayNumber(data.from) <= 365, {
    message: 'O resumo aceita no máximo 366 dias por consulta.',
    path: ['to'],
  });

export type CompanyFinancialSummaryQuery = z.infer<typeof companyFinancialSummaryQuerySchema>;
