import { z } from 'zod';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export const updateCompanyProfileSchema = z.object({
  tradeName: z
    .string()
    .trim()
    .min(2, 'Informe o nome fantasia.')
    .max(160, 'O nome fantasia deve ter no máximo 160 caracteres.'),
  legalName: z
    .string()
    .trim()
    .min(2, 'Informe a razão social.')
    .max(160, 'A razão social deve ter no máximo 160 caracteres.'),
  whatsapp: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 10 || value.length === 11, 'WhatsApp inválido.'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo.')
    .max(120, 'O nome completo deve ter no máximo 120 caracteres.'),
});

export type UpdateCompanyProfilePayload = z.infer<typeof updateCompanyProfileSchema>;
