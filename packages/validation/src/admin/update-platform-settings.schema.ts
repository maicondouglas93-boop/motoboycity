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
    businessHoursEnabled: z.boolean().optional(),
    /**
     * Intervalo minimo que uma marcacao retroativa precisa respeitar entre uma
     * etapa e a seguinte.
     *
     * Aceita 0, que vale "sem restricao" — e o mesmo efeito de nao configurar,
     * mas escrito por quem decidiu conscientemente que nao quer trava. O teto
     * de 240 evita que um erro de digitacao (240 no lugar de 24) transforme a
     * trava numa recusa permanente.
     */
    minMinutesBeforeCollect: z
      .number()
      .int('O tempo mínimo deve ser um número inteiro de minutos.')
      .min(0, 'O tempo mínimo não pode ser negativo.')
      .max(240, 'O tempo mínimo deve ser de no máximo 240 minutos.')
      .optional(),
    minMinutesBeforeDeliver: z
      .number()
      .int('O tempo mínimo deve ser um número inteiro de minutos.')
      .min(0, 'O tempo mínimo não pode ser negativo.')
      .max(240, 'O tempo mínimo deve ser de no máximo 240 minutos.')
      .optional(),
    /**
     * Piso de 2 minutos: abaixo disso o aviso dispararia no intervalo normal
     * entre dois pings e acusaria silencio onde nao ha nenhum.
     */
    locationSilenceAlertMinutes: z
      .number()
      .int('O tempo sem posição deve ser um número inteiro de minutos.')
      .min(2, 'O tempo sem posição deve ser de pelo menos 2 minutos.')
      .max(120, 'O tempo sem posição deve ser de no máximo 120 minutos.')
      .optional(),
  })
  .refine(
    (data) =>
      data.driverCommissionPercentage !== undefined ||
      data.dispatchOfferTimeoutSeconds !== undefined ||
      data.returnProximityRadiusMeters !== undefined ||
      data.businessHoursEnabled !== undefined ||
      data.minMinutesBeforeCollect !== undefined ||
      data.minMinutesBeforeDeliver !== undefined ||
      data.locationSilenceAlertMinutes !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  );

export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsSchema>;
