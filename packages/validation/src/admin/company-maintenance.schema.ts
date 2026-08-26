import { z } from 'zod';

const digits = (value: string) => value.replace(/\D/g, '');
const phoneSchema = z
  .string()
  .transform(digits)
  .refine((value) => value.length === 10 || value.length === 11, 'Telefone invalido.');

export const adminUpdateCompanySchema = z.object({
  tradeName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(160),
  document: z
    .string()
    .transform(digits)
    .refine((value) => value.length === 14, 'CNPJ invalido.'),
  regionId: z.string().uuid('Selecione uma regiao valida.'),
});

const invoiceOverdueBlockAfterDaysSchema = z
  .number()
  .int('O prazo de bloqueio deve ser um numero inteiro de dias.')
  .min(1, 'O bloqueio deve ocorrer depois de pelo menos 1 dia de atraso.')
  .max(365, 'O prazo de bloqueio deve ser de no maximo 365 dias.')
  .nullable();

/**
 * Politica financeira de uma unica empresa.
 *
 * Os campos impossiveis ficam literalmente nulos no contrato. Isso impede
 * uma configuracao manual de carregar silenciosamente uma agenda antiga, ou
 * uma agenda mensal manter ao mesmo tempo um dia da semana.
 */
export const adminUpdateCompanyBillingSettingsSchema = z.discriminatedUnion('invoiceClosingMode', [
  z.object({
    invoiceClosingMode: z.literal('MANUAL'),
    invoiceClosingFrequency: z.null(),
    invoiceClosingWeekday: z.null(),
    invoiceClosingMonthDay: z.null(),
    invoiceOverdueBlockAfterDays: invoiceOverdueBlockAfterDaysSchema,
  }),
  z
    .object({
      invoiceClosingMode: z.literal('AUTOMATIC'),
      invoiceClosingFrequency: z.enum(['WEEKLY', 'MONTHLY']),
      invoiceClosingWeekday: z.number().int().min(0).max(6).nullable(),
      invoiceClosingMonthDay: z.number().int().min(1).max(31).nullable(),
      invoiceOverdueBlockAfterDays: invoiceOverdueBlockAfterDaysSchema,
    })
    .superRefine((data, context) => {
      if (data.invoiceClosingFrequency === 'WEEKLY') {
        if (data.invoiceClosingWeekday === null) {
          context.addIssue({
            code: 'custom',
            path: ['invoiceClosingWeekday'],
            message: 'Escolha o dia da semana do fechamento.',
          });
        }
        if (data.invoiceClosingMonthDay !== null) {
          context.addIssue({
            code: 'custom',
            path: ['invoiceClosingMonthDay'],
            message: 'Fechamento semanal nao usa dia do mes.',
          });
        }
        return;
      }

      if (data.invoiceClosingMonthDay === null) {
        context.addIssue({
          code: 'custom',
          path: ['invoiceClosingMonthDay'],
          message: 'Escolha o dia do mes do fechamento.',
        });
      }
      if (data.invoiceClosingWeekday !== null) {
        context.addIssue({
          code: 'custom',
          path: ['invoiceClosingWeekday'],
          message: 'Fechamento mensal nao usa dia da semana.',
        });
      }
    }),
]);

export const adminCompanyAddressSchema = z
  .object({
    label: z.string().trim().max(80).optional(),
    street: z.string().trim().min(1),
    number: z.string().trim().min(1),
    complement: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().length(2),
    zip: z.string().trim().min(8).max(9),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    isPrimary: z.boolean().default(false),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe latitude e longitude juntas, ou nenhuma das duas.',
    path: ['lng'],
  });

export const adminCreateCompanyMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
  role: z.enum(['OWNER', 'OPERATOR']),
  password: z.string().min(8).max(72),
});

export const adminUpdateCompanyMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
  role: z.enum(['OWNER', 'OPERATOR']),
});

export type AdminUpdateCompanyPayload = z.infer<typeof adminUpdateCompanySchema>;
export type AdminUpdateCompanyBillingSettingsPayload = z.infer<
  typeof adminUpdateCompanyBillingSettingsSchema
>;
export type AdminCompanyAddressPayload = z.infer<typeof adminCompanyAddressSchema>;
export type AdminCreateCompanyMemberPayload = z.infer<typeof adminCreateCompanyMemberSchema>;
export type AdminUpdateCompanyMemberPayload = z.infer<typeof adminUpdateCompanyMemberSchema>;
