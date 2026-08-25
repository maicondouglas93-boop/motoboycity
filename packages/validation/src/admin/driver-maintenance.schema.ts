import { z } from 'zod';

const digits = (value: string) => value.replace(/\D/g, '');

export const adminUpdateDriverSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .transform(digits)
    .refine((value) => [10, 11].includes(value.length), 'Telefone invalido.'),
  cpf: z
    .string()
    .transform(digits)
    .refine((value) => value.length === 11, 'CPF invalido.'),
  birthDate: z.string().date(),
  pixKey: z.string().trim().min(1).max(160),
  pixKeyType: z.enum(['CPF', 'EMAIL', 'PHONE', 'RANDOM']),
  hasCnpj: z.boolean(),
  regionId: z.string().uuid('Selecione uma regiao valida.'),
});

export const driverDocumentTypeSchema = z.enum([
  'SELFIE',
  'RG',
  'CNH_FRONT',
  'CNH_BACK',
  'PROOF_OF_ADDRESS',
]);

export const adminDriverDocumentSchema = z.object({
  type: driverDocumentTypeSchema,
  rgIssuer: z.string().trim().max(80).optional(),
  cnhNumber: z.string().trim().max(40).optional(),
  cnhExpiresAt: z.string().date().optional(),
  cnhIsPaidActivity: z.preprocess(
    (value) =>
      value === true || value === 'true'
        ? true
        : value === false || value === 'false'
          ? false
          : undefined,
    z.boolean().optional(),
  ),
});

export const adminReviewDriverDocumentSchema = z.object({
  reviewStatus: z.enum(['APPROVED', 'REJECTED']),
});

export type AdminUpdateDriverPayload = z.infer<typeof adminUpdateDriverSchema>;
export type AdminDriverDocumentPayload = z.infer<typeof adminDriverDocumentSchema>;
export type AdminReviewDriverDocumentPayload = z.infer<typeof adminReviewDriverDocumentSchema>;
