import { dateInSaoPaulo, saoPauloDateParts, saoPauloLocalToUtc } from '../common/sao-paulo-time';

const INVOICE_CLOSING_HOUR = 0;
const INVOICE_CLOSING_MINUTE = 5;

export { dateInSaoPaulo };

/** A liberação financeira ocorre toda segunda-feira no fuso operacional. */
export function isMondayInSaoPaulo(date: Date): boolean {
  return saoPauloDateParts(date).weekday === 1;
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
  return `${String(localDate.getUTCFullYear()).padStart(4, '0')}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
}

/** Converte a data civil do corte de 00:05 em São Paulo para um instante UTC. */
export function invoiceClosingCutoff(issueDate: string): Date {
  const [year, month, day] = issueDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new RangeError('Data de fechamento inválida.');
  }
  return saoPauloLocalToUtc(year, month, day, INVOICE_CLOSING_HOUR, INVOICE_CLOSING_MINUTE);
}
