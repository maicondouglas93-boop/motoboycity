import { z } from 'zod';

export const createPricingTableSchema = z.object({
  serviceTypeId: z.uuid('serviceTypeId deve ser um UUID válido.'),
  baseFee: z.number().nonnegative('baseFee não pode ser negativo.'),
  perKmFee: z.number().nonnegative('perKmFee não pode ser negativo.'),
  minimumFee: z.number().nonnegative('minimumFee não pode ser negativo.').optional(),
  returnFee: z.number().nonnegative('returnFee não pode ser negativo.').optional(),
});

export type CreatePricingTablePayload = z.infer<typeof createPricingTableSchema>;
