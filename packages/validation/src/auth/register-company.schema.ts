import { z } from 'zod';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

const registerCompanyBaseSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo.'),
  email: z.email('E-mail inválido.'),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 10 || value.length === 11, 'Telefone inválido.'),
  document: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 11 || value.length === 14, 'CPF/CNPJ inválido.'),
  legalName: z.string().trim().min(2, 'Informe a razão social.'),
  tradeName: z.string().trim().min(2, 'Informe o nome fantasia.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
});

/** Usado pelo formulário (company-web) — inclui cidade obrigatória e confirmação de senha. */
export const registerCompanySchema = registerCompanyBaseSchema
  .extend({
    regionId: z.string().uuid('Selecione a cidade de atuação.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

/** Usado pela API — regionId é opcional por retrocompatibilidade; quando ausente, usa a primeira região ativa. */
export const registerCompanyApiSchema = registerCompanyBaseSchema.extend({
  regionId: z.string().uuid('Selecione uma cidade válida.').optional(),
});

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type RegisterCompanyPayload = z.infer<typeof registerCompanyApiSchema>;
