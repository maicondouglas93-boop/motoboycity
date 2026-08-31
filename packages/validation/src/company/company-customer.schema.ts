import { z } from 'zod';
import { deliveryAddressInputSchema } from '../deliveries/create-delivery.schema';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeBrazilPhone(value: string): string {
  const digits = onlyDigits(value);
  return (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits;
}

function hasValidCpfCheckDigits(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export const companyCustomerCpfSchema = z
  .string()
  .transform(onlyDigits)
  .refine(hasValidCpfCheckDigits, 'CPF invalido.');

export const optionalCompanyCustomerCpfSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  companyCustomerCpfSchema.optional(),
);

export const companyCustomerPhoneSchema = z
  .string()
  .transform(normalizeBrazilPhone)
  .refine(
    (phone) =>
      (phone.length === 10 || phone.length === 11) &&
      /^[1-9]\d/.test(phone) &&
      !/^(\d)\1+$/.test(phone),
    'Telefone invalido.',
  );

export const companyCustomerAddressLabelSchema = z
  .string()
  .trim()
  .min(1, 'Informe um nome para o endereco.')
  .max(40, 'O nome do endereco deve ter no maximo 40 caracteres.');

export const companyCustomerSavedAddressSchema = z.object({
  label: companyCustomerAddressLabelSchema,
  address: deliveryAddressInputSchema,
});

export const companyCustomerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo.')
    .max(120, 'O nome deve ter no maximo 120 caracteres.'),
  cpf: optionalCompanyCustomerCpfSchema,
  phone: companyCustomerPhoneSchema,
  addressLabel: companyCustomerAddressLabelSchema.default('Principal'),
  address: deliveryAddressInputSchema,
});

export const createCompanyCustomerSchema = companyCustomerInputSchema;
export const updateCompanyCustomerSchema = companyCustomerInputSchema;

export const listCompanyCustomersQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const companyCustomerRankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(3).max(50).default(10),
});

export const matchCompanyCustomerQuerySchema = z
  .object({
    cpf: optionalCompanyCustomerCpfSchema,
    phone: companyCustomerPhoneSchema.optional(),
  })
  .refine((query) => Boolean(query.cpf || query.phone), {
    message: 'Informe CPF ou telefone.',
    path: ['phone'],
  });

export type CreateCompanyCustomerPayload = z.infer<typeof createCompanyCustomerSchema>;
export type UpdateCompanyCustomerPayload = z.infer<typeof updateCompanyCustomerSchema>;
export type ListCompanyCustomersQuery = z.infer<typeof listCompanyCustomersQuerySchema>;
export type CompanyCustomerRankingQuery = z.infer<typeof companyCustomerRankingQuerySchema>;
export type MatchCompanyCustomerQuery = z.infer<typeof matchCompanyCustomerQuerySchema>;
export type CompanyCustomerSavedAddressPayload = z.infer<typeof companyCustomerSavedAddressSchema>;
