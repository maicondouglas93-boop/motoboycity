import { z } from 'zod';

export const updatePlatformSettingsSchema = z.object({
  driverCommissionPercentage: z
    .number()
    .min(0, 'A comissão do entregador não pode ser menor que 0%.')
    .max(100, 'A comissão do entregador não pode ser maior que 100%.'),
});

export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsSchema>;
