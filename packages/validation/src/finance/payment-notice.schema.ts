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
    { message: 'Informe uma data valida.' },
  );

export const paymentNoticeStatusValues = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;

export const listPaymentNoticesQuerySchema = z.object({
  status: z.enum(paymentNoticeStatusValues).default('PENDING'),
});

export type ListPaymentNoticesQuery = z.infer<typeof listPaymentNoticesQuerySchema>;

/**
 * Aviso da loja de que pagou.
 *
 * O valor e obrigatorio mesmo existindo o total da fatura: pagamento parcial
 * acontece, e assumir "pagou tudo" faria o admin confirmar uma quantia que
 * ninguem digitou.
 */
export const createPaymentNoticeSchema = z.object({
  amount: z.coerce
    .number()
    .positive('Informe um valor maior que zero.')
    .max(999999.99, 'Valor acima do limite.')
    .refine((value) => Number.isInteger(value * 100), {
      message: 'Informe o valor com no maximo duas casas decimais.',
    }),
  paidAt: dateOnlySchema,
  note: z.string().trim().max(280, 'A observação deve ter no máximo 280 caracteres.').optional(),
});

export type CreatePaymentNoticePayload = z.infer<typeof createPaymentNoticeSchema>;

/**
 * Recusa de um aviso pelo admin.
 *
 * O motivo e obrigatorio: recusar sem dizer por que deixa a loja sem saber o
 * que corrigir, e ela vai avisar de novo igual.
 */
export const rejectPaymentNoticeSchema = z.object({
  reviewNote: z
    .string()
    .trim()
    .min(3, 'Diga por que o aviso foi recusado.')
    .max(280, 'O motivo deve ter no máximo 280 caracteres.'),
});

export type RejectPaymentNoticePayload = z.infer<typeof rejectPaymentNoticeSchema>;

/**
 * Confirmacao de recebimento pelo admin.
 *
 * `paymentDate` e `paymentMethod` sao os que vao para a fatura de verdade,
 * podendo divergir do que a loja informou — quem da a baixa e o admin, com o
 * extrato na frente.
 */
export const confirmPaymentNoticeSchema = z.object({
  paymentDate: dateOnlySchema,
  paymentMethod: z.enum(['BILLED', 'ONLINE']),
  reviewNote: z.string().trim().max(280).optional(),
});

export type ConfirmPaymentNoticePayload = z.infer<typeof confirmPaymentNoticeSchema>;
