import { z } from 'zod';

export const upsertCompanyAddressSchema = z
  .object({
    label: z.string().trim().optional(),
    street: z.string().trim().min(1, 'Rua é obrigatória.'),
    number: z.string().trim().min(1, 'Número é obrigatório.'),
    complement: z.string().trim().optional(),
    city: z.string().trim().min(1, 'Cidade é obrigatória.'),
    state: z.string().trim().length(2, 'UF deve ter 2 letras.'),
    zip: z.string().trim().min(8, 'CEP inválido.').max(9, 'CEP inválido.'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  /**
   * As duas coordenadas continuam opcionais em conjunto — há endereço salvo
   * sem elas —, mas metade de um par não é um ponto: gravaria uma coordenada
   * inutilizável e só apareceria como falha no `complete-return`, com o
   * motoboy parado na porta da empresa.
   */
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'Informe latitude e longitude juntas, ou nenhuma das duas.',
    path: ['lng'],
  });

export type UpsertCompanyAddressPayload = z.infer<typeof upsertCompanyAddressSchema>;
