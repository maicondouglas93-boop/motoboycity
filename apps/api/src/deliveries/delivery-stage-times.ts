import type { DeliveryStatus } from '@prisma/client';

export interface StatusTransition {
  fromStatus: DeliveryStatus | null;
  toStatus: DeliveryStatus;
  changedAt: Date;
}

export interface StageSummary {
  /** Quantas entregas tinham as duas pontas da etapa registradas. */
  samples: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  /** Nonagésimo percentil: o "dia ruim" que a média esconde. */
  p90Minutes: number | null;
}

export interface DeliveryStageTimes {
  /** Da criação até um motoboy aceitar — mede a fila, não o deslocamento. */
  aceite: StageSummary;
  /** Do aceite até a coleta — deslocamento do motoboy até a loja. */
  coleta: StageSummary;
  /** Da coleta até a entrega — o trecho que o cliente final espera. */
  entrega: StageSummary;
  /** Da criação até a entrega — o tempo total sentido por quem pediu. */
  total: StageSummary;
}

/**
 * Tempo por etapa derivado do `DeliveryStatusHistory`.
 *
 * Nenhuma coluna nova: o histórico já grava `fromStatus`, `toStatus` e
 * `changedAt` de toda transição, então as durações são calculáveis a partir do
 * que já está no banco.
 *
 * Reporta média, mediana e p90 de propósito. O sistema atual mostra só a
 * média, e média de tempo esconde justamente o que dói: alguns pedidos que
 * demoram muito somem numa média puxada pelos rápidos. A mediana diz o dia
 * normal; o p90 diz o dia ruim.
 */
export function computeStageTimes(deliveries: StatusTransition[][]): DeliveryStageTimes {
  const aceite: number[] = [];
  const coleta: number[] = [];
  const entrega: number[] = [];
  const total: number[] = [];

  for (const history of deliveries) {
    const at = firstOccurrenceMap(history);

    // A origem do relógio é a entrada na fila de despacho. Um pedido agendado
    // que ficou parado até a hora marcada nao deve contar como demora.
    const origem = at.get('AWAITING_DRIVER') ?? at.get('SCHEDULED') ?? null;
    const aceito = at.get('ACCEPTED') ?? null;
    const coletado = at.get('COLLECTED') ?? null;
    const entregue = at.get('DELIVERED') ?? null;

    push(aceite, origem, aceito);
    push(coleta, aceito, coletado);
    push(entrega, coletado, entregue);
    push(total, origem, entregue);
  }

  return {
    aceite: summarize(aceite),
    coleta: summarize(coleta),
    entrega: summarize(entrega),
    total: summarize(total),
  };
}

/**
 * Primeira ocorrência de cada status.
 *
 * "Primeira" importa: uma entrega pode voltar para `AWAITING_DRIVER` quando a
 * oferta expira ou o motoboy é bloqueado. Usar a última faria o tempo de fila
 * encolher artificialmente, escondendo justamente os pedidos que rodaram a
 * fila inteira antes de alguém aceitar.
 */
function firstOccurrenceMap(history: StatusTransition[]): Map<DeliveryStatus, Date> {
  const at = new Map<DeliveryStatus, Date>();

  for (const entry of [...history].sort(
    (left, right) => left.changedAt.getTime() - right.changedAt.getTime(),
  )) {
    if (!at.has(entry.toStatus)) {
      at.set(entry.toStatus, entry.changedAt);
    }
  }

  return at;
}

function push(target: number[], from: Date | null, to: Date | null): void {
  if (!from || !to) {
    return;
  }

  const minutes = (to.getTime() - from.getTime()) / 60_000;
  // Relógio para trás não é dado, é defeito — descartar evita que um registro
  // torto puxe a média para baixo sem ninguém perceber.
  if (minutes < 0) {
    return;
  }

  target.push(minutes);
}

function summarize(values: number[]): StageSummary {
  if (values.length === 0) {
    return { samples: 0, averageMinutes: null, medianMinutes: null, p90Minutes: null };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((accumulated, value) => accumulated + value, 0);

  return {
    samples: sorted.length,
    averageMinutes: round(sum / sorted.length),
    medianMinutes: round(percentile(sorted, 0.5)),
    p90Minutes: round(percentile(sorted, 0.9)),
  };
}

/** Percentil por interpolação linear entre os dois vizinhos. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) {
    return sorted[0] as number;
  }

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower] as number;
  }

  const weight = position - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
