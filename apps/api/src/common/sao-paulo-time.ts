/**
 * O fuso da operação, isolado do fuso do servidor.
 *
 * A operação inteira acontece em Lajinha/MG, e todo relatório que o admin lê é
 * lido em horário local. O banco guarda instantes em UTC e o servidor pode
 * rodar em qualquer fuso, então "hoje", "meia-noite" e "hora do dia" precisam
 * ser derivados explicitamente — nunca de `getHours()`, que devolve o fuso da
 * máquina.
 *
 * `Intl` é a fonte da regra de fuso aqui de propósito: ele carrega a base IANA
 * e acerta o histórico de horário de verão do Brasil, que uma constante `-3`
 * escrita à mão erraria em qualquer data anterior a 2019.
 */
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export interface SaoPauloDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = domingo, como em `Date.prototype.getDay`. */
  weekday: number;
  weekdayShort: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Como o relógio de São Paulo mostrava o instante recebido. */
export function saoPauloDateParts(date: Date): SaoPauloDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const weekdayShort = get('weekday') ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: WEEKDAY_INDEX[weekdayShort] ?? 0,
    weekdayShort,
  };
}

function dateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Data civil vigente no fuso operacional, sem depender do fuso do servidor. */
export function dateInSaoPaulo(date: Date): string {
  const parts = saoPauloDateParts(date);
  return dateString(parts.year, parts.month, parts.day);
}

/**
 * Converte uma data e hora do relógio de São Paulo no instante UTC equivalente.
 *
 * O caminho é chutar e corrigir: monta-se o instante como se o relógio local
 * fosse UTC, pergunta-se ao `Intl` que horas isso representa em São Paulo, e a
 * diferença entre os dois é exatamente o deslocamento vigente naquela data —
 * inclusive em datas de horário de verão, onde ele não é -03.
 */
export function saoPauloLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const represented = saoPauloDateParts(new Date(desiredAsUtc));
  const representedAsUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
  );
  return new Date(desiredAsUtc - (representedAsUtc - desiredAsUtc));
}

function parseDateOnly(dateOnly: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) {
    throw new RangeError(`Data inválida: ${dateOnly}`);
  }
  return { year, month, day };
}

/** Primeiro instante do dia civil informado, no fuso operacional. */
export function startOfDayInSaoPaulo(dateOnly: string): Date {
  const { year, month, day } = parseDateOnly(dateOnly);
  return saoPauloLocalToUtc(year, month, day);
}

/**
 * Último instante do dia civil informado, no fuso operacional.
 *
 * Calculado como o começo do dia seguinte menos um milissegundo, e não como
 * 23:59 local: em um dia de mudança de horário de verão, "23:59" pode não
 * existir ou existir duas vezes, enquanto o começo do dia seguinte é sempre um
 * instante único.
 */
export function endOfDayInSaoPaulo(dateOnly: string): Date {
  const { year, month, day } = parseDateOnly(dateOnly);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return new Date(
    saoPauloLocalToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    ).getTime() - 1,
  );
}
