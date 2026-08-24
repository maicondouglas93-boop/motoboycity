import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

function civilDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/** Recorte obrigatório e limitado para não permitir varredura irrestrita. */
export const companyOperationsReportQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  })
  .refine((data) => civilDayNumber(data.to) - civilDayNumber(data.from) <= 365, {
    message: 'O relatório aceita no máximo 366 dias por consulta.',
    path: ['to'],
  });

export type CompanyOperationsReportQuery = z.infer<
  typeof companyOperationsReportQuerySchema
>;
