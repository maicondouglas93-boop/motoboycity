import { z } from 'zod';

export const updatePlatformSettingsSchema = z
  .object({
    driverCommissionPercentage: z
      .number()
      .min(0, 'A comissão do entregador não pode ser menor que 0%.')
      .max(100, 'A comissão do entregador não pode ser maior que 100%.')
      .optional(),
    dispatchOfferTimeoutSeconds: z
      .number()
      .int('O tempo de resposta deve ser um número inteiro de segundos.')
      .min(10, 'O tempo de resposta deve ser de pelo menos 10 segundos.')
      .max(600, 'O tempo de resposta deve ser de no máximo 600 segundos.')
      .optional(),
    returnProximityRadiusMeters: z
      .number()
      .int('O raio de retorno deve ser um número inteiro de metros.')
      .min(10, 'O raio de retorno deve ser de pelo menos 10 metros.')
      .max(2000, 'O raio de retorno deve ser de no máximo 2000 metros.')
      .optional(),
  })
  .refine(
    (data) =>
      data.driverCommissionPercentage !== undefined ||
      data.dispatchOfferTimeoutSeconds !== undefined ||
      data.returnProximityRadiusMeters !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  );

export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsSchema>;
