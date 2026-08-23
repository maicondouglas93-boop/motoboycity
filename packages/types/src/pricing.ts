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
  baseFee: number;
  /** Distância coberta pela taxa base; o perKmFee só incide acima dela. */
  includedDistanceKm: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
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
  returnProximityRadiusMeters?: number;
  minMinutesBeforeCollect?: number;
  minMinutesBeforeDeliver?: number;
  locationSilenceAlertMinutes?: number;
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
