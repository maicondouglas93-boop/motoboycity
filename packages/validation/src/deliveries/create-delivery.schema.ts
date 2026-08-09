import { z } from 'zod';

export const deliveryAddressInputSchema = z.object({
  street: z.string().trim().min(1, 'Rua é obrigatória.'),
  number: z.string().trim().min(1, 'Número é obrigatório.'),
  complement: z.string().trim().optional(),
  city: z.string().trim().min(1, 'Cidade é obrigatória.'),
  state: z.string().trim().length(2, 'UF deve ter 2 letras.'),
  zip: z.string().trim().min(8, 'CEP inválido.').max(9, 'CEP inválido.'),
  referenceNote: z.string().trim().optional(),
});

export const createDeliverySchema = z.object({
  serviceTypeId: z.uuid('serviceTypeId deve ser um UUID válido.'),
  dropoffAddress: deliveryAddressInputSchema,
  requiresReturn: z.boolean().optional().default(false),
  requiresDeliveryProof: z.boolean().optional().default(false),
  requiresCollectionRecipient: z.boolean().optional().default(false),
  pickupSurchargeChargedToDriver: z.boolean().optional().default(false),
  scheduledAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Data agendada inválida.')
    .optional(),
});

export type DeliveryAddressInput = z.infer<typeof deliveryAddressInputSchema>;
export type CreateDeliveryPayload = z.infer<typeof createDeliverySchema>;
