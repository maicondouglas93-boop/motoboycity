import type { AdminOrderReportQuery } from '@motoboycity/validation';
import type { OrderFinancialStatus } from '@motoboycity/types';
import type { DeliveryStatus, InvoiceStatus, Prisma } from '@prisma/client';

/** today é um dia civil @db.Date, representado em meia-noite UTC. */
export function orderFinancialWhere(
  status: AdminOrderReportQuery['financialStatus'],
  today: Date,
): Prisma.DeliveryWhereInput {
  if (status === 'ALL') return {};
  const completedBilled = { status: 'COMPLETED', paymentMethod: 'BILLED' } as const;
  switch (status) {
    case 'OPEN':
      return {
        ...completedBilled,
        OR: [{ invoiceId: null }, { invoice: { status: { in: ['PENDING', 'OVERDUE'] } } }],
      };
    case 'UNBILLED':
      return { ...completedBilled, invoiceId: null };
    case 'PAID':
      return { ...completedBilled, invoice: { status: 'PAID' } };
    case 'PENDING':
      return { ...completedBilled, invoice: { status: 'PENDING', dueDate: { gte: today } } };
    case 'OVERDUE':
      return {
        ...completedBilled,
        invoice: { OR: [{ status: 'OVERDUE' }, { status: 'PENDING', dueDate: { lt: today } }] },
      };
  }
}

export function orderFinancialStatus(
  delivery: {
    status: DeliveryStatus;
    paymentMethod: 'BILLED' | 'ONLINE';
    invoice: { status: InvoiceStatus; dueDate: Date } | null;
  },
  today: Date,
): OrderFinancialStatus {
  if (delivery.status === 'CANCELLED') return 'CANCELLED';
  if (delivery.paymentMethod !== 'BILLED') return 'NOT_APPLICABLE';
  if (delivery.status !== 'COMPLETED') return 'NOT_READY';
  if (!delivery.invoice) return 'UNBILLED';
  if (delivery.invoice.status === 'CANCELLED') return 'INVOICE_CANCELLED';
  if (delivery.invoice.status === 'PAID') return 'PAID';
  if (delivery.invoice.status === 'OVERDUE' || delivery.invoice.dueDate < today) return 'OVERDUE';
  return 'PENDING';
}
