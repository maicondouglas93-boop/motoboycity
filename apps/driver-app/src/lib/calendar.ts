/**
 * Conta de calendario do seletor de datas, sem tela.
 *
 * Toda data aqui e `AAAA-MM-DD` — o mesmo formato que o filtro do historico
 * manda para a API — e a aritmetica roda em UTC, para o horario de verao de
 * nenhum aparelho empurrar um dia para o vizinho.
 */

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** Domingo primeiro, como no calendario de parede brasileiro. */
export const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export type CalendarMonth = { year: number; month: number };

/** `null` e um espaco vazio antes do dia 1 ou depois do ultimo dia. */
export type CalendarWeek = Array<string | null>;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isoFromUtc(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** O dia de hoje em Sao Paulo, que e onde o motoboy roda. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return saoPauloDate.format(now);
}

/** Mes (0 a 11) de uma data `AAAA-MM-DD`; `null` se a data nao estiver nesse formato. */
export function monthOf(date: string): CalendarMonth | null {
  const match = isoDatePattern.exec(date);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

/**
 * Mes em que o calendario abre: o da data marcada; sem ela, o do limite final
 * (o "ate hoje"); sem os dois, o de hoje.
 */
export function initialMonth(
  value: string,
  maxDate: string | undefined,
  today: string,
): CalendarMonth {
  return (
    monthOf(value) ??
    (maxDate ? monthOf(maxDate) : null) ??
    monthOf(today) ?? { year: 1970, month: 0 }
  );
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const shifted = new Date(Date.UTC(year, month + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

/** Compara meses: negativo se `a` vem antes de `b`. */
export function compareMonths(a: CalendarMonth, b: CalendarMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/**
 * As semanas do mes, de domingo a sabado, so as que tem algum dia do mes.
 * Os espacos fora do mes vem como `null` — a tela os deixa em branco.
 */
export function monthWeeks({ year, month }: CalendarMonth): CalendarWeek[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(isoFromUtc(new Date(Date.UTC(year, month, day))));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: CalendarWeek[] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }
  return weeks;
}

/** Data fora dos limites nao pode ser tocada. Limite ausente nao limita. */
export function isOutsideLimits(date: string, minDate?: string, maxDate?: string): boolean {
  return Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
}

/** "3 de outubro de 2026", para leitor de tela. */
export function spokenDate(date: string): string {
  const month = monthOf(date);
  if (!month) return date;
  return `${Number(date.slice(8, 10))} de ${MONTH_NAMES[month.month].toLowerCase()} de ${
    month.year
  }`;
}
