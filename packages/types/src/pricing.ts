export interface ServiceTypeItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface PricingTableItem {
  id: string;
  regionId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  /** Null identifica a tabela geral usada como fallback. */
  companyId: string | null;
  companyName: string | null;
  baseFee: number;
  /** Distância coberta pela taxa base; o perKmFee só incide acima dela. */
  includedDistanceKm: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  /** Null = usa a divisão global; preenchido = override desta tabela de empresa. */
  driverCommissionPercentage: number | null;
  active: boolean;
  createdAt: string;
}

/**
 * `null` em qualquer um dos três significa "ainda não configurado pelo admin".
 * Nenhum cálculo assume valor padrão: precificar um pedido exige a comissão,
 * despachar exige o timeout e fechar um retorno exige o raio.
 */
export interface PlatformSettingsItem {
  driverCommissionPercentage: number | null;
  dispatchOfferTimeoutSeconds: number | null;
  /** Minutos entre aceite e coleta; null desliga a devolucao automatica a fila. */
  pickupAssignmentTimeoutMinutes: number | null;
  returnProximityRadiusMeters: number | null;
  /** Liga o bloqueio de pedido fora do horário de funcionamento. */
  businessHoursEnabled: boolean;
  /**
   * Intervalo mínimo (minutos) que uma MARCAÇÃO RETROATIVA precisa respeitar
   * entre uma etapa e a seguinte. Null = sem restrição.
   *
   * Não vale para a marcação feita na hora: ali o relógio é o do servidor, e
   * uma entrega legitimamente rápida não pode ser recusada.
   */
  minMinutesBeforeCollect: number | null;
  minMinutesBeforeDeliver: number | null;
  /**
   * Minutos sem posição que disparam o aviso de motoboy com pedido em
   * andamento e rastreamento parado. Null = detector desligado.
   */
  locationSilenceAlertMinutes: number | null;
  /**
   * Limites que acendem o alerta na fila ao vivo, por etapa em que o pedido
   * está parado. Null = sem sinalização para aquela etapa.
   */
  slaAlertMinutesToAccept: number | null;
  slaAlertMinutesToCollect: number | null;
  slaAlertMinutesToDeliver: number | null;
  /** Teto de entregas simultaneas por motoboy. `null` = sem limite. */
  maxConcurrentDeliveriesPerDriver: number | null;
  /** Tamanho maximo do lote. 1 desliga o lote. `null` = teto do formato. */
  maxDeliveriesPerBatch: number | null;
  /** Raio para marcar entrega com destino informado. `null` = padrao de 200 m. */
  deliveryProximityRadiusMeters: number | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

/**
 * Espelha `updatePlatformSettingsSchema`: atualização parcial, ao menos um
 * campo. Não aceita `null` — limpar um valor já configurado não é uma
 * operação suportada, já que isso pararia a operação da plataforma.
 */
export interface UpdatePlatformSettingsInput {
  driverCommissionPercentage?: number;
  businessHoursEnabled?: boolean;
  dispatchOfferTimeoutSeconds?: number;
  pickupAssignmentTimeoutMinutes?: number;
  returnProximityRadiusMeters?: number;
  minMinutesBeforeCollect?: number;
  minMinutesBeforeDeliver?: number;
  locationSilenceAlertMinutes?: number;
  slaAlertMinutesToAccept?: number;
  slaAlertMinutesToCollect?: number;
  slaAlertMinutesToDeliver?: number;
  maxConcurrentDeliveriesPerDriver?: number;
  maxDeliveriesPerBatch?: number;
  deliveryProximityRadiusMeters?: number;
}

export type SurchargeType = 'PERCENTAGE' | 'FIXED';

export interface SurchargeScheduleItem {
  id: string;
  /** 0 = domingo .. 6 = sábado. `null` vale para qualquer dia. */
  weekday: number | null;
  /** Datas civis "AAAA-MM-DD". `null` significa sem limite daquele lado. */
  startDate: string | null;
  endDate: string | null;
  /** Minutos desde a meia-noite no fuso da operação. */
  startMinute: number;
  endMinute: number;
}

export interface SurchargeItem {
  id: string;
  name: string;
  type: SurchargeType;
  value: number;
  driverSharePercentage: number;
  active: boolean;
  /** O interruptor manual — o que o admin liga quando começa a chover. */
  manuallyActive: boolean;
  /**
   * Se esta taxa está valendo AGORA, resolvido no servidor. Vem pronto porque
   * o painel não tem como avaliar janela no fuso da operação sem duplicar a
   * regra — e duas cópias de uma regra de dinheiro divergem.
   */
  activeNow: boolean;
  schedules: SurchargeScheduleItem[];
  createdAt: string;
}

export interface BusinessHourItem {
  id: string;
  /** 0 = domingo .. 6 = sábado. */
  weekday: number;
  /** Minutos desde a meia-noite no fuso da operação. */
  startMinute: number;
  endMinute: number;
}

export interface BusinessHoursResult {
  /** O interruptor geral: sem ele ligado, as faixas não bloqueiam nada. */
  enabled: boolean;
  hours: BusinessHourItem[];
  /** Resolvido no servidor, pelo mesmo motivo de `activeNow` nas taxas. */
  openNow: boolean;
  nextOpeningLabel: string | null;
}

/**
 * Posição de caixa do INSTANTE — quanto há a receber e quanto se deve, agora.
 *
 * Nenhum número aqui é filtrado por período, e é essa a razão de existir
 * separado do relatório: trabalho concluído em junho e nunca faturado continua
 * sendo dinheiro a receber em agosto, e sumiria de qualquer recorte de datas.
 */
export interface CashPositionItem {
  /** Entregas concluídas, faturadas, que ainda não entraram em nenhuma fatura. */
  unbilledValue: number;
  unbilledCount: number;
  /** Faturas emitidas com vencimento ainda no futuro. */
  invoicesDueValue: number;
  invoicesDueCount: number;
  invoicesOverdueValue: number;
  invoicesOverdueCount: number;
  /** Soma dos três acima: tudo que a operação tem a receber hoje. */
  totalReceivable: number;
  /** Saldo dos motoboys já liberado para saque — dívida exigível a qualquer hora. */
  driverAvailableBalance: number;
  /** Saldo ainda no prazo de liberação. */
  driverBlockedBalance: number;
  /** Saques pedidos e ainda não pagos. */
  pendingWithdrawalValue: number;
}
