import { z } from 'zod';

export const protectablePageRouteSchema = z.enum([
  'FINANCEIRO',
  'RELATORIOS',
  'PEDIDOS',
  'CLIENTES',
]);

const pagePasswordSchema = z
  .string()
  .min(4, 'A senha deve ter no mínimo 4 caracteres.')
  .max(64, 'A senha deve ter no máximo 64 caracteres.');

/** Senha de login do painel, só conferida — nunca gravada por estas rotas. */
const accountPasswordSchema = z
  .string()
  .min(1, 'Informe a senha de login do painel.')
  .max(128, 'Senha de login inválida.');

export const setPageProtectionSchema = z.object({
  routeKey: protectablePageRouteSchema,
  password: pagePasswordSchema,
});

export const updatePageProtectionSchema = z
  .object({
    password: pagePasswordSchema.optional(),
    enabled: z.boolean().optional(),
    /**
     * Senha atual da página. A API exige quando a proteção está ativa e o
     * pedido a desativa ou troca a senha — sem ela, quem tem o painel aberto
     * desfaria a proteção sem saber a senha.
     */
    currentPassword: z.string().min(1, 'Informe a senha atual da página.').max(64).optional(),
  })
  .refine(
    (data) => data.password !== undefined || data.enabled !== undefined,
    {
      message: 'Informe a nova senha ou altere o status da proteção.',
    },
  );

export const verifyPagePasswordSchema = z.object({
  routeKey: protectablePageRouteSchema,
  password: z.string().min(1, 'Informe a senha.'),
});

/**
 * Redefinição da senha esquecida de uma página, por um de dois caminhos: a
 * senha de login do painel ou a resposta da pergunta secreta do dono.
 */
export const resetPageProtectionSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('ACCOUNT_PASSWORD'),
      accountPassword: accountPasswordSchema,
      newPassword: pagePasswordSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal('SECRET_ANSWER'),
      secretAnswer: z
        .string()
        .trim()
        .min(1, 'Informe a resposta da pergunta secreta.')
        .max(100, 'A resposta deve ter no máximo 100 caracteres.'),
      newPassword: pagePasswordSchema,
    })
    .strict(),
]);

/** Cadastro ou troca da pergunta secreta; exige a senha de login do dono. */
export const setPageProtectionRecoverySchema = z
  .object({
    accountPassword: accountPasswordSchema,
    question: z
      .string()
      .trim()
      .min(5, 'Escreva a pergunta com pelo menos 5 caracteres.')
      .max(200, 'A pergunta deve ter no máximo 200 caracteres.'),
    answer: z
      .string()
      .trim()
      .min(2, 'A resposta deve ter pelo menos 2 caracteres.')
      .max(100, 'A resposta deve ter no máximo 100 caracteres.'),
  })
  .strict();

export type SetPageProtectionInput = z.infer<typeof setPageProtectionSchema>;
export type UpdatePageProtectionInput = z.infer<typeof updatePageProtectionSchema>;
export type VerifyPagePasswordInput = z.infer<typeof verifyPagePasswordSchema>;
export type ResetPageProtectionInput = z.infer<typeof resetPageProtectionSchema>;
export type SetPageProtectionRecoveryInput = z.infer<typeof setPageProtectionRecoverySchema>;
