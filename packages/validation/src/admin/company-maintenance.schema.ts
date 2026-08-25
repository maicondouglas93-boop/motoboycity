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
export type AdminCompanyAddressPayload = z.infer<typeof adminCompanyAddressSchema>;
export type AdminCreateCompanyMemberPayload = z.infer<typeof adminCreateCompanyMemberSchema>;
export type AdminUpdateCompanyMemberPayload = z.infer<typeof adminUpdateCompanyMemberSchema>;
