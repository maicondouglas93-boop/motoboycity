import { dateInSaoPaulo, saoPauloDateParts, saoPauloLocalToUtc } from '../common/sao-paulo-time';

const INVOICE_CLOSING_HOUR = 0;
const INVOICE_CLOSING_MINUTE = 5;

export interface InvoiceClosingPolicy {
  invoiceClosingMode: 'AUTOMATIC' | 'MANUAL';
  invoiceClosingFrequency: 'WEEKLY' | 'MONTHLY' | null;
  invoiceClosingWeekday: number | null;
  invoiceClosingMonthDay: number | null;
}

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
  return (
    latestInvoiceClosingDateForPolicyInSaoPaulo(date, {
      invoiceClosingMode: 'AUTOMATIC',
      invoiceClosingFrequency: 'WEEKLY',
      invoiceClosingWeekday: 1,
      invoiceClosingMonthDay: null,
    }) ?? dateInSaoPaulo(date)
  );
}

/** Converte a data civil do corte de 00:05 em São Paulo para um instante UTC. */
export function invoiceClosingCutoff(issueDate: string): Date {
  const [year, month, day] = issueDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new RangeError('Data de fechamento inválida.');
  }
  return saoPauloLocalToUtc(year, month, day, INVOICE_CLOSING_HOUR, INVOICE_CLOSING_MINUTE);
}

/**
 * A proxima segunda-feira em que o corte das 00:05 AINDA VAI acontecer.
 *
 * Derivada do ultimo corte, e nao do dia da semana: numa segunda as 10h o
 * corte ja rodou, entao "o proximo" e a segunda seguinte. Deduzir pelo dia da
 * semana faria a tela da loja dizer "fecha hoje" logo abaixo da fatura de hoje
 * — que era exatamente o que estava acontecendo.
 */
export function nextInvoiceClosingDateInSaoPaulo(date: Date): string {
  return (
    nextInvoiceClosingDateForPolicyInSaoPaulo(date, {
      invoiceClosingMode: 'AUTOMATIC',
      invoiceClosingFrequency: 'WEEKLY',
      invoiceClosingWeekday: 1,
      invoiceClosingMonthDay: null,
    }) ?? dateInSaoPaulo(date)
  );
}

function formatCivilDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthlyClosingDate(year: number, month: number, configuredDay: number): Date {
  return new Date(Date.UTC(year, month - 1, Math.min(configuredDay, daysInMonth(year, month))));
}

/**
 * Ultimo ciclo configurado cujo corte das 00:05 ja aconteceu.
 *
 * Para os dias 29, 30 e 31, meses curtos fecham no ultimo dia civil. A funcao
 * trabalha com datas UTC apenas como calendario; a comparacao do instante usa
 * `invoiceClosingCutoff`, que converte corretamente Sao Paulo para UTC.
 */
export function latestInvoiceClosingDateForPolicyInSaoPaulo(
  date: Date,
  policy: InvoiceClosingPolicy,
): string | null {
  if (policy.invoiceClosingMode !== 'AUTOMATIC') return null;

  const parts = saoPauloDateParts(date);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (policy.invoiceClosingFrequency === 'WEEKLY') {
    const weekday = policy.invoiceClosingWeekday;
    if (weekday === null || weekday < 0 || weekday > 6) return null;
    const daysSinceConfiguredWeekday = (localDate.getUTCDay() - weekday + 7) % 7;
    localDate.setUTCDate(localDate.getUTCDate() - daysSinceConfiguredWeekday);
    if (invoiceClosingCutoff(formatCivilDate(localDate)).getTime() > date.getTime()) {
      localDate.setUTCDate(localDate.getUTCDate() - 7);
    }
    return formatCivilDate(localDate);
  }

  if (policy.invoiceClosingFrequency === 'MONTHLY') {
    const monthDay = policy.invoiceClosingMonthDay;
    if (monthDay === null || monthDay < 1 || monthDay > 31) return null;
    const currentMonth = monthlyClosingDate(parts.year, parts.month, monthDay);
    if (invoiceClosingCutoff(formatCivilDate(currentMonth)).getTime() <= date.getTime()) {
      return formatCivilDate(currentMonth);
    }
    return formatCivilDate(monthlyClosingDate(parts.year, parts.month - 1, monthDay));
  }

  return null;
}

/** Proximo ciclo futuro de uma politica automatica; manual nao promete data. */
export function nextInvoiceClosingDateForPolicyInSaoPaulo(
  date: Date,
  policy: InvoiceClosingPolicy,
): string | null {
  const latest = latestInvoiceClosingDateForPolicyInSaoPaulo(date, policy);
  if (!latest) return null;
  const [year = 0, month = 1, day = 1] = latest.split('-').map(Number);

  if (policy.invoiceClosingFrequency === 'WEEKLY') {
    const next = new Date(Date.UTC(year, month - 1, day + 7));
    return formatCivilDate(next);
  }

  const monthDay = policy.invoiceClosingMonthDay;
  if (policy.invoiceClosingFrequency === 'MONTHLY' && monthDay !== null) {
    return formatCivilDate(monthlyClosingDate(year, month + 1, monthDay));
  }

  return null;
}
