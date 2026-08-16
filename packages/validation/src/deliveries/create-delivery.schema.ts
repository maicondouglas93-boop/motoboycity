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

export const createDeliverySchema = z
  .object({
    serviceTypeId: z.uuid('serviceTypeId deve ser um UUID válido.'),
    // true (padrão): endereço de entrega informado agora, preço calculado na
    // criação, como sempre foi. false: sem endereço — motoboy captura o
    // destino por GPS ao marcar a entrega, preço calculado retroativamente.
    destinationKnownAtCreation: z.boolean().optional().default(true),
    dropoffAddress: deliveryAddressInputSchema.optional(),
    requiresReturn: z.boolean().optional().default(false),
    requiresDeliveryProof: z.boolean().optional().default(false),
    requiresCollectionRecipient: z.boolean().optional().default(false),
    pickupSurchargeChargedToDriver: z.boolean().optional().default(false),
    scheduledAt: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Data agendada inválida.')
      .optional(),
  })
  .superRefine((data, context) => {
    if (data.destinationKnownAtCreation && !data.dropoffAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dropoffAddress'],
        message: 'Endereço de entrega é obrigatório quando o destino é conhecido na criação.',
      });
    }
    if (!data.destinationKnownAtCreation && data.dropoffAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dropoffAddress'],
        message: 'Não informe endereço de entrega quando o destino é desconhecido na criação.',
      });
    }
  });

/**
 * Um lote é uma unidade de despacho: todas as entregas são criadas juntas e
 * recebem o mesmo motoboy. Por isso não há agendamento parcial do lote.
 */
export const createDeliveryBatchSchema = z.object({
  deliveries: z
    .array(createDeliverySchema)
    .min(2, 'Um lote precisa ter pelo menos duas entregas.')
    .max(50, 'Um lote pode ter no máximo 50 entregas.')
    .superRefine((deliveries, context) => {
      deliveries.forEach((delivery, index) => {
        if (delivery.scheduledAt) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'scheduledAt'],
            message: 'Pedidos em lote não podem ser agendados nesta versão.',
          });
        }
      });

      const modes = new Set(deliveries.map((delivery) => delivery.destinationKnownAtCreation));
      if (modes.size > 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveries'],
          message: 'Todas as entregas do lote devem usar o mesmo modo de destino.',
        });
      }
    }),
});

export type DeliveryAddressInput = z.infer<typeof deliveryAddressInputSchema>;
export type CreateDeliveryPayload = z.infer<typeof createDeliverySchema>;
export type CreateDeliveryBatchPayload = z.infer<typeof createDeliveryBatchSchema>;
