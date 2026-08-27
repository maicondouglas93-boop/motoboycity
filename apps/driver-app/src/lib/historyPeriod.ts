export type HistoryPeriod = { from?: string; to?: string };

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const brazilianDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeHistoryDate(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isoMatch = isoDatePattern.exec(trimmed);
  const brazilianMatch = brazilianDatePattern.exec(trimmed);
  const match = isoMatch ?? brazilianMatch;
  if (!match) return null;

  const year = Number(isoMatch ? match[1] : match[3]);
  const month = Number(match[2]);
  const day = Number(isoMatch ? match[3] : match[1]);
  if (!isRealDate(year, month, day)) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeHistoryPeriod(fromInput: string, toInput: string): HistoryPeriod | null {
  const from = normalizeHistoryDate(fromInput);
  const to = normalizeHistoryDate(toInput);
  if (from === null || to === null || (from && to && from > to)) return null;

  return { ...(from && { from }), ...(to && { to }) };
}

export function formatHistoryDate(date: string): string {
  const match = isoDatePattern.exec(date);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
