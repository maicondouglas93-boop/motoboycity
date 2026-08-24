import type { DeliveryStatus } from './delivery.js';

export interface OperationsReportCompanyItem {
  companyId: string;
  companyName: string;
  createdCount: number;
  completedCount: number;
  /** Pedidos criados no recorte cujo estado atual e CANCELLED. */
  cancelledCount: number;
  completedTotalValue: number;
  platformValue: number;
}

/**
 * Desempenho do entregador em metricas SEPARADAS, sem nota unica.
 *
 * Um numero so de "performance" embutiria uma escolha de incentivo: ranquear
 * por volume faz o motoboy correr e recusar corrida ruim; por tempo, idem.
 * Mostrar lado a lado devolve a escolha para quem opera.
 */
export interface OperationsReportDriverItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  completedCount: number;
  driverValue: number;
  /** Aceitas mas nao entregues: o destinatario nao recebeu. */
  failedCount: number;
  /** Canceladas depois de o motoboy ja ter aceitado. */
  cancelledAfterAcceptCount: number;
  /** `null` quando nao houve corrida encerrada — diferente de zero por cento. */
  completionRate: number | null;
  offersReceived: number;
  offersAccepted: number;
  acceptanceRate: number | null;
  averageMinutesToComplete: number | null;
  /** Quantas entregas entraram na media — o denominador, a vista. */
  timedSamples: number;
}

export interface OperationsReportServiceTypeItem {
  serviceTypeName: string;
  createdCount: number;
  completedCount: number;
  completedTotalValue: number;
}

/**
 * Quando a operacao aperta.
 *
 * Responde a pergunta de escala de entregador: em que horas e em que dias vale
 * ter mais gente na rua. Tudo contado no relogio de Sao Paulo.
 */
export interface PeakHourBucket {
  /** 0 a 23, no fuso operacional. */
  hour: number;
  count: number;
  /** Media por dia do periodo, que e o numero comparavel entre recortes. */
  averagePerDay: number;
}

export interface PeakWeekdayBucket {
  /** 0 = domingo, como em `Date.prototype.getDay`. */
  weekday: number;
  count: number;
  /** Quantas vezes este dia da semana caiu dentro do periodo. */
  occurrences: number;
  averagePerOccurrence: number;
}

export interface DeliveryPeakHours {
  totalConsidered: number;
  daysInPeriod: number;
  byHour: PeakHourBucket[];
  byWeekday: PeakWeekdayBucket[];
  /** `null` quando nao houve pedido no periodo — nao existe pico de nada. */
  busiestHour: number | null;
  busiestWeekday: number | null;
}

/**
 * O mesmo recorte, imediatamente antes e com a MESMA duração.
 *
 * `changePercent` é nulo quando a base é zero: sair de nenhuma entrega para dez
 * não é crescimento percentual, é um começo.
 */
export interface OperationsReportComparison {
  period: { from: string; to: string };
  ordersCreatedCount: number;
  deliveriesCompletedCount: number;
  totalValue: number;
  averageTicket: number;
  changePercent: {
    ordersCreated: number | null;
    deliveriesCompleted: number | null;
    totalValue: number | null;
    averageTicket: number | null;
  };
}

export interface AdminOperationsReport {
  period: { from: string; to: string };
  /**
   * O recorte termina hoje. Quando falso, a tela avisa que os números não
   * atualizam sozinhos — decidir isso exige o fuso da operação, então vem
   * resolvido do servidor.
   */
  live: boolean;
  comparison: OperationsReportComparison;
  ordersCreated: {
    count: number;
    byCurrentStatus: Record<DeliveryStatus, number>;
  };
  deliveriesCompleted: {
    count: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    averageTicket: number;
  };
  companies: OperationsReportCompanyItem[];
  drivers: OperationsReportDriverItem[];
  serviceTypes: OperationsReportServiceTypeItem[];
  peakHours: DeliveryPeakHours;
}

/** Modalidade no relatório da empresa, sem repasse ou margem da plataforma. */
export interface CompanyOperationsReportServiceTypeItem {
  serviceTypeName: string;
  createdCount: number;
  completedCount: number;
  pricedCompletedCount: number;
  unpricedCompletedCount: number;
  completedTotalValue: number;
  averageTicket: number;
  createdWithReturnCount: number;
  completedReturnValue: number;
}

export interface CompanyOperationsReportDayItem {
  /** Dia civil no fuso da operação. */
  date: string;
  createdCount: number;
  completedCount: number;
  completedTotalValue: number;
}

export interface CompanyOperationsReportComparison {
  period: { from: string; to: string };
  ordersCreatedCount: number;
  deliveriesCompletedCount: number;
  completedTotalValue: number;
  averageTicket: number;
  changePercent: {
    ordersCreated: number | null;
    deliveriesCompleted: number | null;
    completedTotalValue: number | null;
    averageTicket: number | null;
  };
}

/**
 * Operação vista pela própria empresa.
 *
 * Criados e concluídos são coortes independentes. O payload expõe somente o
 * custo da loja (`totalValue`); repasse do entregador e margem da plataforma
 * não fazem parte deste contrato.
 */
export interface CompanyOperationsReport {
  period: { from: string; to: string };
  live: boolean;
  comparison: CompanyOperationsReportComparison;
  ordersCreated: {
    count: number;
    unpricedCount: number;
    byCurrentStatus: Record<DeliveryStatus, number>;
  };
  deliveriesCompleted: {
    count: number;
    pricedCount: number;
    unpricedCount: number;
    totalValue: number;
    averageTicket: number;
  };
  daily: CompanyOperationsReportDayItem[];
  peakHours: DeliveryPeakHours;
  serviceTypes: CompanyOperationsReportServiceTypeItem[];
  returns: {
    createdCount: number;
    completedCount: number;
    completedReturnValue: number;
  };
  batches: {
    batchCount: number;
    deliveryCount: number;
  };
}
