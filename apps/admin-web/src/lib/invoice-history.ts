import type { InvoiceListItem, InvoiceStatus } from '@motoboycity/types';

export interface InvoiceHistoryFilters {
  status: InvoiceStatus | 'ALL';
  from: string;
  to: string;
  number: string;
}

export function filterInvoiceHistory(
  invoices: readonly InvoiceListItem[],
  filters: InvoiceHistoryFilters,
): InvoiceListItem[] {
  const number = filters.number.trim().toLocaleLowerCase('pt-BR');
  return invoices.filter(
    (invoice) =>
      (filters.status === 'ALL' || invoice.status === filters.status) &&
      (!filters.from || invoice.issueDate >= filters.from) &&
      (!filters.to || invoice.issueDate <= filters.to) &&
      (!number || invoice.number.toLocaleLowerCase('pt-BR').includes(number)),
  );
}

/** Resumo de exibição em centavos; canceladas permanecem no histórico, fora da cobrança. */
export function summarizeInvoiceHistory(invoices: readonly InvoiceListItem[]) {
  const groups: Record<InvoiceStatus, { count: number; cents: number }> = {
    PENDING: { count: 0, cents: 0 },
    PAID: { count: 0, cents: 0 },
    OVERDUE: { count: 0, cents: 0 },
    CANCELLED: { count: 0, cents: 0 },
  };
  for (const invoice of invoices) {
    groups[invoice.status].count += 1;
    groups[invoice.status].cents += Math.round(invoice.totalValue * 100);
  }
  return {
    count: invoices.length,
    billed: (groups.PENDING.cents + groups.OVERDUE.cents + groups.PAID.cents) / 100,
    paid: groups.PAID.cents / 100,
    paidCount: groups.PAID.count,
    outstanding: (groups.PENDING.cents + groups.OVERDUE.cents) / 100,
    outstandingCount: groups.PENDING.count + groups.OVERDUE.count,
    overdue: groups.OVERDUE.cents / 100,
    overdueCount: groups.OVERDUE.count,
    cancelledCount: groups.CANCELLED.count,
  };
}
