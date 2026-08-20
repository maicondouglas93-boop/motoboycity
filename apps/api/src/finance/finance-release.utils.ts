const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const INVOICE_CLOSING_HOUR = 0;
const INVOICE_CLOSING_MINUTE = 5;

function saoPauloDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
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
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday') ?? '',
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

/** A liberação financeira ocorre toda segunda-feira no fuso operacional. */
export function isMondayInSaoPaulo(date: Date): boolean {
  return saoPauloDateParts(date).weekday === 'Mon';
}

/**
 * A entrega fechada em uma segunda ainda entra no próximo ciclo. O horário
 * em UTC representa 00:00 de São Paulo (UTC-03), preservando a data correta
 * nos extratos do produto.
 */
export function nextMondayReleaseAt(date: Date): Date {
  const parts = saoPauloDateParts(date);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const currentWeekday = localDate.getUTCDay();
  const daysUntilNextMonday = currentWeekday === 1 ? 7 : (8 - currentWeekday) % 7;
  localDate.setUTCDate(localDate.getUTCDate() + daysUntilNextMonday);

  return new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 3, 0, 0),
  );
}

/**
 * Retorna a segunda-feira cujo corte das 00:05 já deveria ter ocorrido.
 * Na própria segunda antes das 00:05, o último corte válido ainda é o da
 * semana anterior. Isso permite recuperar uma execução perdida no boot.
 */
export function latestInvoiceClosingDateInSaoPaulo(date: Date): string {
  const parts = saoPauloDateParts(date);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = localDate.getUTCDay();
  let daysSinceMonday = (weekday + 6) % 7;
  const minutesSinceMidnight = parts.hour * 60 + parts.minute;
  if (weekday === 1 && minutesSinceMidnight < INVOICE_CLOSING_HOUR * 60 + INVOICE_CLOSING_MINUTE) {
    daysSinceMonday = 7;
  }
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return dateString(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate(),
  );
}

/** Converte a data civil do corte de 00:05 em São Paulo para um instante UTC. */
export function invoiceClosingCutoff(issueDate: string): Date {
  const [year, month, day] = issueDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new RangeError('Data de fechamento inválida.');
  }
  const desiredAsUtc = Date.UTC(year, month - 1, day, INVOICE_CLOSING_HOUR, INVOICE_CLOSING_MINUTE);
  const guess = new Date(desiredAsUtc);
  const represented = saoPauloDateParts(guess);
  const representedAsUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
  );
  return new Date(desiredAsUtc - (representedAsUtc - desiredAsUtc));
}
