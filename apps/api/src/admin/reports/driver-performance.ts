/**
 * Desempenho do entregador, em métricas separadas.
 *
 * Deliberadamente NÃO existe uma nota única de "performance". Um número só
 * embute uma escolha de incentivo: ranquear por volume faz o motoboy correr e
 * recusar corrida ruim; por tempo, idem. Mostrar as medidas lado a lado devolve
 * essa escolha para quem opera, que pode ordenar pelo que importa naquele dia —
 * e deixa explícito o que está sendo medido.
 */
export interface DeliveryOutcome {
  driverId: string;
  status: string;
  /** Minutos entre o aceite e a conclusão. `null` quando não dá para medir. */
  minutesToComplete: number | null;
}

export interface OfferOutcome {
  driverId: string;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}

export interface DriverPerformance {
  driverId: string;
  /** Entregas concluídas — o volume, sem juízo de valor. */
  completedCount: number;
  /** Aceitas mas não entregues: o destinatário não recebeu. */
  failedCount: number;
  /** Canceladas depois de o motoboy já ter aceitado. */
  cancelledAfterAcceptCount: number;
  /**
   * Das que ele aceitou, quantas terminaram entregues.
   *
   * `null` quando ele não aceitou nada no período — zero por cento diria que
   * ele falhou em tudo, quando na verdade não houve o que medir.
   */
  completionRate: number | null;
  offersReceived: number;
  offersAccepted: number;
  /** `null` quando não recebeu oferta nenhuma, pelo mesmo motivo. */
  acceptanceRate: number | null;
  /** `null` quando nenhuma entrega concluída tinha as duas pontas registradas. */
  averageMinutesToComplete: number | null;
  /** Quantas entregas entraram na média — o denominador, à vista. */
  timedSamples: number;
}

/** Estados terminais que contam contra quem já tinha aceitado a corrida. */
const FAILED_STATUS = 'FAILED';
const CANCELLED_STATUS = 'CANCELLED';
const COMPLETED_STATUS = 'COMPLETED';

function ratio(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

export function computeDriverPerformance(
  deliveries: DeliveryOutcome[],
  offers: OfferOutcome[],
): DriverPerformance[] {
  const porEntregador = new Map<string, DriverPerformance>();

  const obter = (driverId: string): DriverPerformance => {
    const atual = porEntregador.get(driverId);
    if (atual) return atual;
    const novo: DriverPerformance = {
      driverId,
      completedCount: 0,
      failedCount: 0,
      cancelledAfterAcceptCount: 0,
      completionRate: null,
      offersReceived: 0,
      offersAccepted: 0,
      acceptanceRate: null,
      averageMinutesToComplete: null,
      timedSamples: 0,
    };
    porEntregador.set(driverId, novo);
    return novo;
  };

  const somaMinutos = new Map<string, number>();

  for (const delivery of deliveries) {
    const item = obter(delivery.driverId);
    if (delivery.status === COMPLETED_STATUS) {
      item.completedCount += 1;
      if (delivery.minutesToComplete !== null) {
        item.timedSamples += 1;
        somaMinutos.set(
          delivery.driverId,
          (somaMinutos.get(delivery.driverId) ?? 0) + delivery.minutesToComplete,
        );
      }
    } else if (delivery.status === FAILED_STATUS) {
      item.failedCount += 1;
    } else if (delivery.status === CANCELLED_STATUS) {
      item.cancelledAfterAcceptCount += 1;
    }
  }

  for (const offer of offers) {
    const item = obter(offer.driverId);
    item.offersReceived += 1;
    if (offer.response === 'ACCEPTED') {
      item.offersAccepted += 1;
    }
  }

  for (const item of porEntregador.values()) {
    /**
     * O denominador são as corridas que ele assumiu e terminaram — concluídas,
     * não entregues e canceladas depois do aceite. Entregas ainda em andamento
     * ficam de fora: contá-las como falha puniria quem está com pedido na rua
     * no instante do relatório.
     */
    const encerradas = item.completedCount + item.failedCount + item.cancelledAfterAcceptCount;
    item.completionRate = ratio(item.completedCount, encerradas);
    item.acceptanceRate = ratio(item.offersAccepted, item.offersReceived);
    item.averageMinutesToComplete =
      item.timedSamples > 0
        ? Math.round(((somaMinutos.get(item.driverId) ?? 0) / item.timedSamples) * 10) / 10
        : null;
  }

  /**
   * Ordem padrão por volume, que é a leitura mais comum ao abrir a tela — mas é
   * só a ordem inicial: a tela permite reordenar, porque o critério de "melhor"
   * é de quem opera, não deste módulo.
   */
  return [...porEntregador.values()].sort(
    (left, right) =>
      right.completedCount - left.completedCount || left.driverId.localeCompare(right.driverId),
  );
}
