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
  companyId: z.string().uuid('Selecione uma empresa valida.'),
});

export const manualInvoiceEligibleQuerySchema = z.object({
  companyId: z.string().uuid(),
});

/**
 * Emissao extraordinaria de uma fatura para uma unica empresa.
 *
 * A selecao explicita evita que o botao manual alcance outras empresas ou
 * pedidos que o administrador nao revisou. IDs repetidos tambem sao recusados:
 * somar o mesmo pedido duas vezes na previa seria uma cobranca enganosa.
 */
export const manualInvoiceSchema = z
  .object({
    companyId: z.string().uuid(),
    deliveryIds: z
      .array(z.string().uuid())
      .min(1, 'Selecione pelo menos um pedido para faturar.')
      .max(500, 'Selecione no maximo 500 pedidos por fatura.'),
    issueDate: dateOnlySchema,
    dueDate: dateOnlySchema,
  })
  .refine((data) => new Set(data.deliveryIds).size === data.deliveryIds.length, {
    message: 'A selecao possui pedidos repetidos.',
    path: ['deliveryIds'],
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'O vencimento nao pode ser anterior a emissao.',
    path: ['dueDate'],
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

export const updateInvoiceDueDateSchema = z.object({
  dueDate: dateOnlySchema,
  reason: z
    .string()
    .trim()
    .min(10, 'Explique o motivo da alteracao em pelo menos 10 caracteres.')
    .max(300, 'O motivo deve ter no maximo 300 caracteres.'),
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
export type ManualInvoiceEligibleQuery = z.infer<typeof manualInvoiceEligibleQuerySchema>;
export type ManualInvoicePayload = z.infer<typeof manualInvoiceSchema>;
export type MarkInvoicePaidPayload = z.infer<typeof markInvoicePaidSchema>;
export type UpdateInvoiceDueDatePayload = z.infer<typeof updateInvoiceDueDateSchema>;
export type CancelInvoicePayload = z.infer<typeof cancelInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
