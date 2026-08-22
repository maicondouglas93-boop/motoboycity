import type { DeliveryStatus } from './delivery.js';

export interface OperationsReportCompanyItem {
  companyId: string;
  companyName: string;
  createdCount: number;
  completedCount: number;
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

export interface AdminOperationsReport {
  period: { from: string; to: string };
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
