import { z } from 'zod';

export const walletTransactionStatusValues = ['PENDING', 'RELEASED', 'CANCELLED'] as const;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

export const listWalletTransactionsQuerySchema = z
  .object({
    status: z.enum(walletTransactionStatusValues).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

export type ListWalletTransactionsQuery = z.infer<typeof listWalletTransactionsQuerySchema>;
