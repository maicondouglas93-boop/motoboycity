import { z } from 'zod';

const slaMinutesSchema = z
  .number()
  .int('O limite de alerta deve ser um número inteiro de minutos.')
  .min(1, 'O limite de alerta deve ser de pelo menos 1 minuto.')
  .max(480, 'O limite de alerta deve ser de no máximo 480 minutos.');

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
    aiqfomeDispatchDelayMinutes: z
      .number()
      .int('O tempo de preparo do aiqfome deve ser um numero inteiro de minutos.')
      .min(1, 'O tempo de preparo do aiqfome deve ser de pelo menos 1 minuto.')
      .max(480, 'O tempo de preparo do aiqfome deve ser de no maximo 480 minutos.')
      .optional(),
    pickupAssignmentTimeoutMinutes: z
      .number()
      .int('O prazo de coleta deve ser um numero inteiro de minutos.')
      .min(1, 'O prazo de coleta deve ser de pelo menos 1 minuto.')
      .max(480, 'O prazo de coleta deve ser de no maximo 480 minutos.')
      .optional(),
    collectionProximityRadiusMeters: z
      .number()
      .int('O raio de coleta deve ser um numero inteiro de metros.')
      .min(50, 'O raio de coleta deve ser de pelo menos 50 metros.')
      .max(5000, 'O raio de coleta deve ser de no maximo 5000 metros.')
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
    /**
     * Piso de 1 minuto: um limite de zero acenderia todo pedido no instante em
     * que entra na fila, e a cor deixaria de significar qualquer coisa.
     */
    slaAlertMinutesToAccept: slaMinutesSchema.optional(),
    slaAlertMinutesToCollect: slaMinutesSchema.optional(),
    slaAlertMinutesToDeliver: slaMinutesSchema.optional(),
    /**
     * Teto de entregas simultaneas por motoboy.
     *
     * Omitir mantem o valor atual; o padrao do sistema e SEM teto, porque o
     * motoboy junta varias entregas na mesma saida. Este campo existe para o
     * caso oposto: alguem que aceita tudo e segura a fila.
     *
     * Piso de 1: zero deixaria a operacao inteira sem despacho, e um erro de
     * digitacao nao pode ter esse poder.
     */
    maxConcurrentDeliveriesPerDriver: z
      .number()
      .int('O limite de entregas simultaneas deve ser um numero inteiro.')
      .min(1, 'O limite de entregas simultaneas deve ser de pelo menos 1.')
      .max(200, 'O limite de entregas simultaneas deve ser de no maximo 200.')
      .optional(),
    /**
     * Tamanho maximo do lote que a empresa pode lancar de uma vez.
     *
     * 1 desliga o lote: a loja passa a lancar um pedido por vez. O teto de 50 e
     * o do proprio formato, e nao um numero escolhido aqui.
     */
    maxDeliveriesPerBatch: z
      .number()
      .int('O tamanho do lote deve ser um numero inteiro.')
      .min(1, 'O tamanho do lote deve ser de pelo menos 1.')
      .max(50, 'O tamanho do lote deve ser de no maximo 50.')
      .optional(),
    /**
     * Raio para marcar entrega com destino informado.
     *
     * Piso de 50 m: abaixo disso o GPS urbano recusa entrega feita, porque o
     * erro do proprio aparelho ja passa do raio.
     */
    deliveryProximityRadiusMeters: z
      .number()
      .int('O raio de entrega deve ser um numero inteiro de metros.')
      .min(50, 'O raio de entrega deve ser de pelo menos 50 metros.')
      .max(5000, 'O raio de entrega deve ser de no maximo 5000 metros.')
      .optional(),
  })
  .refine(
    (data) =>
      data.driverCommissionPercentage !== undefined ||
      data.dispatchOfferTimeoutSeconds !== undefined ||
      data.aiqfomeDispatchDelayMinutes !== undefined ||
      data.pickupAssignmentTimeoutMinutes !== undefined ||
      data.collectionProximityRadiusMeters !== undefined ||
      data.returnProximityRadiusMeters !== undefined ||
      data.businessHoursEnabled !== undefined ||
      data.minMinutesBeforeCollect !== undefined ||
      data.minMinutesBeforeDeliver !== undefined ||
      data.locationSilenceAlertMinutes !== undefined ||
      data.slaAlertMinutesToAccept !== undefined ||
      data.slaAlertMinutesToCollect !== undefined ||
      data.slaAlertMinutesToDeliver !== undefined ||
      data.maxConcurrentDeliveriesPerDriver !== undefined ||
      data.maxDeliveriesPerBatch !== undefined ||
      data.deliveryProximityRadiusMeters !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  );

export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsSchema>;
