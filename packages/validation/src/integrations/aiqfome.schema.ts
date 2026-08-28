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
