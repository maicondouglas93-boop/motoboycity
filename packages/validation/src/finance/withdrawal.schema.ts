import { z } from 'zod';

export const withdrawalRequestStatusValues = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'] as const;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

const moneySchema = z
  .number()
  .positive('O valor do saque deve ser maior que zero.')
  .max(100_000, 'O valor do saque excede o limite permitido.')
  .refine((value) => Number.isInteger(value * 100), {
    message: 'Informe o valor com no máximo duas casas decimais.',
  });

const optionalNoteSchema = z.string().trim().min(3).max(1_000).optional();

export const requestWithdrawalSchema = z.object({
  amount: moneySchema,
});

export const approveWithdrawalSchema = z.object({
  note: optionalNoteSchema,
});

export const markWithdrawalPaidSchema = z.object({
  note: optionalNoteSchema,
  paymentReference: z.string().trim().min(1).max(180).optional(),
});

export const rejectWithdrawalSchema = z.object({
  note: z.string().trim().min(3, 'Informe o motivo da rejeição.').max(1_000),
});

export const listWithdrawalRequestsQuerySchema = z
  .object({
    status: z.enum(withdrawalRequestStatusValues).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export type RequestWithdrawalPayload = z.infer<typeof requestWithdrawalSchema>;
export type ApproveWithdrawalPayload = z.infer<typeof approveWithdrawalSchema>;
export type MarkWithdrawalPaidPayload = z.infer<typeof markWithdrawalPaidSchema>;
export type RejectWithdrawalPayload = z.infer<typeof rejectWithdrawalSchema>;
export type ListWithdrawalRequestsQuery = z.infer<typeof listWithdrawalRequestsQuerySchema>;
