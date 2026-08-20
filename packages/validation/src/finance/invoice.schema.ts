import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const invoiceStatusValues = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

export const closeInvoicesSchema = z.object({
  issueDate: dateOnlySchema,
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
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
