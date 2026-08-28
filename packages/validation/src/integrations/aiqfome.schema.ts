import { z } from 'zod';

const oauthValueSchema = z.string().trim().min(1).max(2048);

export const aiqfomeOauthCallbackQuerySchema = z
  .object({
    code: oauthValueSchema.optional(),
    state: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{32,128}$/)
      .optional(),
    error: oauthValueSchema.optional(),
    error_description: oauthValueSchema.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.error && (!value.code || !value.state)) {
      ctx.addIssue({
        code: 'custom',
        message: 'O retorno OAuth precisa conter code e state.',
      });
    }
  });

export type AiqfomeOauthCallbackQuery = z.infer<typeof aiqfomeOauthCallbackQuerySchema>;

export const updateAiqfomeSettingsSchema = z
  .object({
    serviceTypeId: z.uuid('Selecione uma modalidade de entrega valida.').nullable().optional(),
    dispatchDelayMinutes: z
      .number()
      .int('O tempo de preparo deve ser um numero inteiro de minutos.')
      .min(1, 'O tempo de preparo deve ser de pelo menos 1 minuto.')
      .max(480, 'O tempo de preparo deve ser de no maximo 480 minutos.')
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.serviceTypeId !== undefined || value.dispatchDelayMinutes !== undefined,
    { message: 'Informe ao menos uma configuracao para atualizar.' },
  );

export type UpdateAiqfomeSettingsPayload = z.infer<typeof updateAiqfomeSettingsSchema>;
