import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.')
  .refine(
    (value) => {
      const [year, month, day] = value.split('-').map(Number);
      if (!year || !month || !day) return false;
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      );
    },
    { message: 'Informe uma data válida.' },
  );

export const invoiceStatusValues = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

export const closeInvoicesSchema = z.object({
  issueDate: dateOnlySchema,
});

/**
 * Cancelamento de fatura.
 *
 * O motivo e obrigatorio e vira nota no historico da fatura. Cancelar cobranca
 * sem explicar por que e o tipo de coisa que ninguem consegue reconstruir seis
 * meses depois, quando a empresa perguntar por que aquele mes nao foi cobrado.
 */
export const cancelInvoiceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explique o motivo do cancelamento em pelo menos 10 caracteres.')
    .max(300, 'O motivo deve ter no máximo 300 caracteres.'),
});

export const markInvoicePaidSchema = z.object({
  paymentDate: dateOnlySchema,
  paymentMethod: z.enum(['BILLED', 'ONLINE']),
});

export const listInvoicesQuerySchema = z
  .object({
    status: z.enum(invoiceStatusValues).optional(),
    companyId: z.string().uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export type CloseInvoicesPayload = z.infer<typeof closeInvoicesSchema>;
export type MarkInvoicePaidPayload = z.infer<typeof markInvoicePaidSchema>;
export type CancelInvoicePayload = z.infer<typeof cancelInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
