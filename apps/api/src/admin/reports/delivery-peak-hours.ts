import type { DeliveryPeakHours, PeakHourBucket, PeakWeekdayBucket } from '@motoboycity/types';
import { dateInSaoPaulo, saoPauloDateParts } from '../../common/sao-paulo-time';

/**
 * Quando a operação aperta.
 *
 * A pergunta que isso responde é de escala de entregador: em que horas e em
 * que dias vale ter mais gente na rua. Por isso tudo aqui é contado no relógio
 * de São Paulo — a hora em UTC deslocaria o pico do almoço para as 15h e o
 * relatório perderia o sentido.
 *
 * As formas vêm de `@motoboycity/types` e não são redeclaradas aqui: uma cópia
 * local do contrato já foi a origem de um drift entre a API e o painel.
 */

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Conta quantas vezes cada dia da semana aparece entre duas datas civis.
 *
 * Sem isto, o relatório mentiria de graça: uma janela de 30 dias quase nunca
 * tem o mesmo número de segundas e de domingos, e o dia que aparecer cinco
 * vezes ganharia 25% de volume sobre o que aparecer quatro — puro efeito de
 * calendário, lido como se fosse demanda.
 */
function weekdayOccurrences(fromDateOnly: string, toDateOnly: string): number[] {
  const occurrences = new Array<number>(7).fill(0);
  const [fromYear, fromMonth, fromDay] = fromDateOnly.split('-').map(Number);
  const cursor = new Date(Date.UTC(fromYear!, fromMonth! - 1, fromDay!));
  const last = (() => {
    const [year, month, day] = toDateOnly.split('-').map(Number);
    return Date.UTC(year!, month! - 1, day!);
  })();

  while (cursor.getTime() <= last) {
    occurrences[cursor.getUTCDay()]! += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return occurrences;
}

/**
 * @param createdAt instantes de criação dos pedidos já filtrados pelo período
 * @param period    a janela do relatório, usada para normalizar as médias
 */
export function computePeakHours(
  createdAt: Date[],
  period: { from: Date; to: Date },
): DeliveryPeakHours {
  const hourCounts = new Array<number>(24).fill(0);
  const weekdayCounts = new Array<number>(7).fill(0);

  for (const instant of createdAt) {
    const parts = saoPauloDateParts(instant);
    hourCounts[parts.hour]! += 1;
    weekdayCounts[parts.weekday]! += 1;
  }

  const occurrences = weekdayOccurrences(dateInSaoPaulo(period.from), dateInSaoPaulo(period.to));
  const daysInPeriod = occurrences.reduce((total, value) => total + value, 0);

  const byHour: PeakHourBucket[] = hourCounts.map((count, hour) => ({
    hour,
    count,
    averagePerDay: daysInPeriod > 0 ? roundToTenth(count / daysInPeriod) : 0,
  }));

  const byWeekday: PeakWeekdayBucket[] = weekdayCounts.map((count, weekday) => ({
    weekday,
    count,
    occurrences: occurrences[weekday]!,
    averagePerOccurrence:
      occurrences[weekday]! > 0 ? roundToTenth(count / occurrences[weekday]!) : 0,
  }));

  /**
   * O pico do dia da semana sai da média, não da contagem, justamente para
   * não premiar o dia que apareceu mais vezes no calendário. Empate fica com
   * o primeiro, só para a resposta ser estável entre execuções.
   */
  const totalConsidered = createdAt.length;
  const busiestHour =
    totalConsidered === 0
      ? null
      : byHour.reduce((best, bucket) => (bucket.count > best.count ? bucket : best)).hour;
  const busiestWeekday =
    totalConsidered === 0
      ? null
      : byWeekday.reduce((best, bucket) =>
          bucket.averagePerOccurrence > best.averagePerOccurrence ? bucket : best,
        ).weekday;

  return {
    totalConsidered,
    daysInPeriod,
    byHour,
    byWeekday,
    busiestHour,
    busiestWeekday,
  };
}
