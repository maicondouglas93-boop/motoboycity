import { z } from 'zod';

export const createPricingTableSchema = z.object({
  serviceTypeId: z.uuid('serviceTypeId deve ser um UUID válido.'),
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
});

export type CreatePricingTablePayload = z.infer<typeof createPricingTableSchema>;
