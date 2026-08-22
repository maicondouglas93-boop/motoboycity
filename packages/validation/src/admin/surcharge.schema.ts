import { z } from 'zod';

const MINUTES_IN_DAY = 24 * 60;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

/**
 * Janela em que a taxa vale sozinha.
 *
 * `endMinute` menor ou igual a `startMinute` é permitido de propósito: significa
 * atravessar a meia-noite, que é o caso da madrugada. O único intervalo
 * rejeitado é o de tamanho zero, que não valeria nunca e seria configuração
 * morta na tela.
 */
export const surchargeScheduleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    startDate: dateOnly.nullable().optional(),
    endDate: dateOnly.nullable().optional(),
    startMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
    endMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
  })
  .refine((data) => data.startMinute !== data.endMinute, {
    message: 'A janela precisa ter duração — início e fim não podem ser iguais.',
    path: ['endMinute'],
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['startDate'],
  });

export const upsertSurchargeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Dê um nome à taxa.')
    .max(80, 'O nome pode ter no máximo 80 caracteres.'),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive('O valor da taxa precisa ser maior que zero.'),
  driverSharePercentage: z
    .number()
    .min(0, 'O repasse não pode ser negativo.')
    .max(100, 'O repasse não pode passar de 100%.')
    .optional(),
  active: z.boolean().optional(),
  manuallyActive: z.boolean().optional(),
  schedules: z.array(surchargeScheduleSchema).max(20, 'No máximo 20 janelas por taxa.').optional(),
});

export type UpsertSurchargePayload = z.infer<typeof upsertSurchargeSchema>;
export type SurchargeSchedulePayload = z.infer<typeof surchargeScheduleSchema>;
