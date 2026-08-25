import { z } from 'zod';

export const createPricingTableSchema = z
  .object({
    serviceTypeId: z.uuid('serviceTypeId deve ser um UUID válido.'),
    /** Ausente = tabela geral da região; preenchido = preço exclusivo da empresa. */
    companyId: z.uuid('companyId deve ser um UUID válido.').optional(),
    baseFee: z.number().nonnegative('baseFee não pode ser negativo.'),
    /**
     * Distância coberta pela taxa base — a "bandeirada". Ausente significa zero,
     * que é o modelo antigo: por quilômetro desde o metro zero.
     */
    includedDistanceKm: z
      .number()
      .nonnegative('includedDistanceKm não pode ser negativo.')
      .optional(),
    perKmFee: z.number().nonnegative('perKmFee não pode ser negativo.'),
    minimumFee: z.number().nonnegative('minimumFee não pode ser negativo.').optional(),
    returnFee: z.number().nonnegative('returnFee não pode ser negativo.').optional(),
    /**
     * Override versionado junto do preço personalizado. A plataforma recebe o
     * complemento para 100%; tabelas gerais continuam usando a divisão global.
     */
    driverCommissionPercentage: z
      .number()
      .min(0, 'O percentual do entregador não pode ser menor que 0%.')
      .max(100, 'O percentual do entregador não pode ser maior que 100%.')
      .multipleOf(0.01, 'Use no máximo duas casas decimais no percentual do entregador.')
      .optional(),
  })
  .superRefine((payload, context) => {
    if (payload.companyId && payload.driverCommissionPercentage === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['driverCommissionPercentage'],
        message: 'Informe a divisão entre entregador e plataforma para o preço personalizado.',
      });
    }

    if (!payload.companyId && payload.driverCommissionPercentage !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['driverCommissionPercentage'],
        message: 'A divisão personalizada só pode ser usada em uma tabela de empresa.',
      });
    }
  });

export type CreatePricingTablePayload = z.infer<typeof createPricingTableSchema>;
