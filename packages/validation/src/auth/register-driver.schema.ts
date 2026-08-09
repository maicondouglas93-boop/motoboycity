import { z } from 'zod';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export const pixKeyTypes = ['CPF', 'EMAIL', 'PHONE', 'RANDOM'] as const;
export type PixKeyType = (typeof pixKeyTypes)[number];

const BR_DATE_FORMAT = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function isPastDate(isoDate: string): boolean {
  const time = new Date(isoDate).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

const registerDriverSharedFields = {
  name: z.string().trim().min(2, 'Informe seu nome completo.'),
  email: z.email('E-mail inválido.'),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 10 || value.length === 11, 'Telefone inválido.'),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 11, 'CPF inválido.'),
  pixKey: z.string().trim().min(1, 'Informe sua chave PIX.'),
  pixKeyType: z.enum(pixKeyTypes),
  hasCnpj: z.boolean(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
};

/**
 * Usado pela API — o formulário (registerDriverSchema) já transforma
 * DD/MM/AAAA para ISO antes de enviar, então a API recebe e valida ISO
 * diretamente (não reaplica o formato de exibição).
 */
export const registerDriverApiSchema = z.object({
  ...registerDriverSharedFields,
  birthDate: z
    .string()
    .regex(ISO_DATE_FORMAT, 'Data de nascimento inválida.')
    .refine(isPastDate, 'Data de nascimento inválida.'),
});

/** Usado pelo formulário (driver-app) — aceita DD/MM/AAAA e inclui confirmação de senha. */
export const registerDriverSchema = z
  .object({
    ...registerDriverSharedFields,
    birthDate: z
      .string()
      .regex(BR_DATE_FORMAT, 'Use o formato DD/MM/AAAA.')
      .transform((value) => {
        const [day, month, year] = value.split('/');
        return `${year}-${month}-${day}`;
      })
      .refine(isPastDate, 'Data de nascimento inválida.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type RegisterDriverInput = z.infer<typeof registerDriverSchema>;
export type RegisterDriverPayload = z.infer<typeof registerDriverApiSchema>;
