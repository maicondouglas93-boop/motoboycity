import type { DeliveryStatus } from '@prisma/client';

export interface StatusTransition {
  fromStatus: DeliveryStatus | null;
  toStatus: DeliveryStatus;
  changedAt: Date;
  /**
   * Horario declarado numa marcacao retroativa. Nulo na marcacao normal.
   *
   * Quando existe, e ELE que vale para o tempo por etapa: o motoboy coletou as
   * 14h e tocou o botao as 15h, entao a coleta levou o que levou — usar o toque
   * inventaria uma hora de deslocamento que nao aconteceu.
   */
  occurredAt?: Date | null;
}

export interface StageTimesOptions {
  /**
   * Descarta entregas que tiveram qualquer marcacao retroativa.
   *
   * Existe porque um SLA calculado sobre horario declarado pelo proprio
   * interessado nao e medicao. Para acompanhar a operacao no dia a dia, o
   * declarado e a melhor aproximacao disponivel; para cobrar meta de alguem,
   * so serve o que o servidor carimbou.
   */
  excludeRetroactive?: boolean;
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
export function computeStageTimes(
  deliveries: StatusTransition[][],
  options: StageTimesOptions = {},
): DeliveryStageTimes {
  const accumulator = new StageTimesAccumulator(options);
  accumulator.add(deliveries);
  return accumulator.result();
}

/**
 * Acumula somente as durações necessárias para percentis. Assim o service
 * pode ler históricos em páginas sem manter todas as entregas na memória.
 */
export class StageTimesAccumulator {
  private readonly aceite: number[] = [];
  private readonly coleta: number[] = [];
  private readonly entrega: number[] = [];
  private readonly total: number[] = [];

  constructor(private readonly options: StageTimesOptions = {}) {}

  add(deliveries: StatusTransition[][]): void {
    for (const history of deliveries) {
      if (this.options.excludeRetroactive && history.some((entry) => entry.occurredAt)) {
        continue;
      }

      const at = firstOccurrenceMap(history);
      const origem = at.get('AWAITING_DRIVER') ?? at.get('SCHEDULED') ?? null;
      const aceito = at.get('ACCEPTED') ?? null;
      const coletado = at.get('COLLECTED') ?? null;
      const entregue = at.get('DELIVERED') ?? null;

      push(this.aceite, origem, aceito);
      push(this.coleta, aceito, coletado);
      push(this.entrega, coletado, entregue);
      push(this.total, origem, entregue);
    }
  }

  result(): DeliveryStageTimes {
    return {
      aceite: summarize(this.aceite),
      coleta: summarize(this.coleta),
      entrega: summarize(this.entrega),
      total: summarize(this.total),
    };
  }
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

  // Ordena pelo horario EFETIVO, nao pelo de escrita: uma coleta declarada
  // para as 14h e registrada as 15h vem antes da entrega das 14h30, mesmo tendo
  // sido escrita depois.
  for (const entry of [...history].sort(
    (left, right) => effectiveAt(left).getTime() - effectiveAt(right).getTime(),
  )) {
    if (!at.has(entry.toStatus)) {
      at.set(entry.toStatus, effectiveAt(entry));
    }
  }

  return at;
}

/** O declarado quando existe; senao, o carimbo do servidor. */
function effectiveAt(entry: StatusTransition): Date {
  return entry.occurredAt ?? entry.changedAt;
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
