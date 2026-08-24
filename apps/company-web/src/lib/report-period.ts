const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateOnlyInSaoPaulo(date: Date): string {
  const parts = Object.fromEntries(
    saoPauloDate
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

function utcDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addDays(dateOnly: string, days: number): string {
  return new Date(utcDate(dateOnly).getTime() + days * DAY_IN_MS).toISOString().slice(0, 10);
}

export function isReportDate(value: string | null): value is string {
  if (!value || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = utcDate(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function defaultReportPeriod(now = new Date()): { from: string; to: string } {
  const to = dateOnlyInSaoPaulo(now);
  return { from: addDays(to, -29), to };
}

export function previousComparablePeriod(period: { from: string; to: string }): {
  from: string;
  to: string;
} {
  const days =
    Math.floor((utcDate(period.to).getTime() - utcDate(period.from).getTime()) / DAY_IN_MS) + 1;
  const to = addDays(period.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export function formatReportDate(value: string): string {
  if (!isReportDate(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
