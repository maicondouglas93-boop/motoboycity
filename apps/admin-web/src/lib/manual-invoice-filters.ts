import type { ManualInvoiceCandidate } from '@motoboycity/types';

// Mesmo teto de manualInvoiceSchema; selecionar nunca corta silenciosamente a lista.
export const MANUAL_INVOICE_SELECTION_LIMIT = 500;
export const MANUAL_INVOICE_SORT_OPTIONS = {
  oldest: 'Conclusão: mais antigos',
  newest: 'Conclusão: mais recentes',
  numberAsc: 'Número: crescente',
  numberDesc: 'Número: decrescente',
  valueAsc: 'Valor: menor primeiro',
  valueDesc: 'Valor: maior primeiro',
} as const;

export interface ManualInvoiceFilters {
  search: string;
  from: string;
  to: string;
  serviceType: string;
  minValue: string;
  maxValue: string;
  selection: 'all' | 'selected' | 'unselected';
  sort: keyof typeof MANUAL_INVOICE_SORT_OPTIONS;
}

export const EMPTY_MANUAL_INVOICE_FILTERS: ManualInvoiceFilters = {
  search: '',
  from: '',
  to: '',
  serviceType: '',
  minValue: '',
  maxValue: '',
  selection: 'all',
  sort: 'oldest',
};

export function operationDay(instant: string | Date): string {
  return new Date(instant).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function invoicePeriod(
  preset: 'today' | 'yesterday' | 'last7' | 'month' | 'previousMonth',
  now = new Date(),
): { from: string; to: string } {
  const today = operationDay(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: shiftDay(today, -1), to: shiftDay(today, -1) };
    case 'last7':
      return { from: shiftDay(today, -6), to: today };
    case 'month':
      return { from: monthStart, to: today };
    case 'previousMonth': {
      const lastDay = shiftDay(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
  }
}

function valueCents(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return NaN;
  const cents = Math.round(Number(text.replace(',', '.')) * 100);
  return Number.isSafeInteger(cents) ? cents : NaN;
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function manualInvoiceFilterError(filters: ManualInvoiceFilters): string | null {
  if ((filters.from && !validDay(filters.from)) || (filters.to && !validDay(filters.to))) {
    return 'Informe datas de conclusão válidas.';
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    return 'O início da conclusão não pode ser posterior ao fim.';
  }
  const min = valueCents(filters.minValue);
  const max = valueCents(filters.maxValue);
  if (Number.isNaN(min) || Number.isNaN(max)) {
    return 'Informe valores positivos com até 2 casas decimais, como 5,50, sem separador de milhar.';
  }
  if (min !== null && max !== null && min > max) {
    return 'O valor mínimo não pode ser maior que o máximo.';
  }
  return null;
}

export function filterManualInvoiceCandidates(
  candidates: readonly ManualInvoiceCandidate[],
  filters: ManualInvoiceFilters,
  selectedIds: readonly string[],
): ManualInvoiceCandidate[] {
  if (manualInvoiceFilterError(filters)) return [];
  const selected = new Set(selectedIds);
  const terms = filters.search
    .toLocaleLowerCase('pt-BR')
    .split(/[,;\s]+/)
    .filter(Boolean);
  const min = valueCents(filters.minValue);
  const max = valueCents(filters.maxValue);
  const filtered = candidates.filter((candidate) => {
    if (
      terms.length &&
      !terms.some((term) => {
        const number = term.replace(/^#/, '');
        return (
          String(candidate.displayNumber) === number ||
          (candidate.externalOrderNumber?.toLocaleLowerCase('pt-BR').includes(term) ?? false)
        );
      })
    )
      return false;
    if (filters.serviceType && candidate.serviceTypeName !== filters.serviceType) return false;
    if (filters.selection === 'selected' && !selected.has(candidate.id)) return false;
    if (filters.selection === 'unselected' && selected.has(candidate.id)) return false;
    if (filters.from || filters.to) {
      const day = operationDay(candidate.completedAt);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
    }
    const cents = Math.round(candidate.totalValue * 100);
    return (min === null || cents >= min) && (max === null || cents <= max);
  });
  return filtered.sort((a, b) => {
    let comparison: number;
    switch (filters.sort) {
      case 'newest':
        comparison = Date.parse(b.completedAt) - Date.parse(a.completedAt);
        break;
      case 'numberAsc':
        comparison = a.displayNumber - b.displayNumber;
        break;
      case 'numberDesc':
        comparison = b.displayNumber - a.displayNumber;
        break;
      case 'valueAsc':
        comparison = a.totalValue - b.totalValue;
        break;
      case 'valueDesc':
        comparison = b.totalValue - a.totalValue;
        break;
      default:
        comparison = Date.parse(a.completedAt) - Date.parse(b.completedAt);
    }
    return comparison || a.displayNumber - b.displayNumber || a.id.localeCompare(b.id);
  });
}

/** null significa que nada deve mudar: adicionar os resultados excederia o teto. */
export function selectInvoiceResults(
  current: readonly string[],
  results: readonly string[],
): string[] | null {
  const next = [...new Set([...current, ...results])];
  return next.length <= MANUAL_INVOICE_SELECTION_LIMIT ? next : null;
}

export function deselectInvoiceResults(
  current: readonly string[],
  results: readonly string[],
): string[] {
  const removed = new Set(results);
  return current.filter((id) => !removed.has(id));
}
