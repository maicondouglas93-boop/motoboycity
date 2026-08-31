import { z } from 'zod';

const slaMinutesSchema = z
  .number()
  .int('O limite de alerta deve ser um número inteiro de minutos.')
  .min(1, 'O limite de alerta deve ser de pelo menos 1 minuto.')
  .max(480, 'O limite de alerta deve ser de no máximo 480 minutos.');

/**
 * `null` DESLIGA a regra; ausente mantem o valor atual.
 *
 * A distincao existe porque nao havia caminho de volta: uma vez configurado, um
 * raio nao podia mais ser desligado pelo painel, e campo vazio significava
 * "mantenha como esta". Numa emergencia — um defeito no aplicativo travando a
 * conclusao — o administrador ficava sem interruptor e dependia de alguem mexer
 * no banco.
 *
 * So aceitam `null` os campos cujo nulo ja e um estado valido do dominio:
 * os tres raios, o prazo de coleta e o teto de entregas simultaneas. O tempo de
 * resposta da oferta e a comissao continuam sem essa opcao — ali o nulo nao
 * desliga uma regra, congela o despacho e impede precificar.
 */
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
      .nullable()
      .optional(),
    collectionProximityRadiusMeters: z
      .number()
      .int('O raio de coleta deve ser um numero inteiro de metros.')
      .min(50, 'O raio de coleta deve ser de pelo menos 50 metros.')
      .max(5000, 'O raio de coleta deve ser de no maximo 5000 metros.')
      .nullable()
      .optional(),
    returnProximityRadiusMeters: z
      .number()
      .int('O raio de retorno deve ser um número inteiro de metros.')
      .min(10, 'O raio de retorno deve ser de pelo menos 10 metros.')
      .max(2000, 'O raio de retorno deve ser de no máximo 2000 metros.')
      .nullable()
      .optional(),
    businessHoursEnabled: z.boolean().optional(),
    /**
     * Dia da semana do saque. `null` e uma escolha — "qualquer dia" —, e nao
     * ausencia de configuracao; por isso `nullable` alem de `optional`.
     */
    withdrawalWeekday: z
      .number()
      .int('O dia do saque deve ser um número inteiro.')
      .min(0, 'O dia do saque vai de 0 (domingo) a 6 (sábado).')
      .max(6, 'O dia do saque vai de 0 (domingo) a 6 (sábado).')
      .nullable()
      .optional(),
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
      .nullable()
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
      .nullable()
      .optional(),
    /**
     * Precisao minima do GPS quando a posicao do motoboy define o destino.
     *
     * NAO aceita `null`, ao contrario dos raios: aqui o nulo nao desligaria uma
     * regra, deixaria o preco sair de uma triangulacao de antena a quilometros
     * do cliente. Omitir mantem o padrao de 100 m.
     *
     * Piso de 10 m porque abaixo disso o proprio GPS urbano quase nunca fecha e
     * a etapa ficaria impossivel; teto de 1000 m porque acima disso a
     * "coordenada" descreve um bairro, nao um endereco — e ela vira o endereco.
     */
    deferredDestinationMaxAccuracyMeters: z
      .number()
      .int('A precisao minima deve ser um numero inteiro de metros.')
      .min(10, 'A precisao minima deve ser de pelo menos 10 metros.')
      .max(1000, 'A precisao minima deve ser de no maximo 1000 metros.')
      .optional(),
    /**
     * Punicao automatica por recusa/expiracao de oferta.
     *
     * O interruptor e independente dos numeros: ligar sem contagem e sem prazo
     * nao pune ninguem, e a tela avisa o que falta. O contrario tambem vale —
     * ajustar os numeros com a regra desligada nao muda o despacho.
     */
    driverPunishmentEnabled: z.boolean().optional(),
    driverPunishmentTrigger: z
      .enum(['DECLINED', 'EXPIRED', 'DECLINED_OR_EXPIRED'], {
        message: 'Selecione quando a punicao deve ser aplicada.',
      })
      .optional(),
    /**
     * Piso de 1: punir na primeira recusa e uma operacao possivel, ainda que
     * severa. Teto de 20 porque acima disso a regra nunca dispara na pratica e
     * so daria a impressao de estar protegendo a fila.
     */
    driverPunishmentOfferCount: z
      .number()
      .int('A quantidade de recusas deve ser um numero inteiro.')
      .min(1, 'A quantidade de recusas deve ser de pelo menos 1.')
      .max(20, 'A quantidade de recusas deve ser de no maximo 20.')
      .optional(),
    /**
     * Piso de 1 minuto e teto de 1440 (um dia). Acima de um dia a punicao
     * automatica vira bloqueio de conta, que ja existe e e decisao do admin.
     */
    driverPunishmentMinutes: z
      .number()
      .int('O tempo de punicao deve ser um numero inteiro de minutos.')
      .min(1, 'O tempo de punicao deve ser de pelo menos 1 minuto.')
      .max(1440, 'O tempo de punicao deve ser de no maximo 1440 minutos.')
      .optional(),
    driverPunishmentIgnoreWithActiveDelivery: z.boolean().optional(),
    driverPunishmentOncePerDelivery: z.boolean().optional(),
  })
  /**
   * Era uma lista de dezesseis comparacoes, uma por campo, e cada campo novo
   * exigia lembrar de acrescentar mais uma linha aqui. Esquecer disso nao
   * quebra compilacao nem teste: apenas aceita silenciosamente um payload
   * vazio. A checagem por valor cobre qualquer campo, inclusive os proximos.
   */
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });

export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsSchema>;
