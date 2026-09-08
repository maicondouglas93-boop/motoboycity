import { Prisma } from '@prisma/client';
import { dateInSaoPaulo } from './finance-release.utils';

type PaymentReactivationTransaction = Pick<
  Prisma.TransactionClient,
  'company' | 'companyStatusHistory' | 'invoice'
>;

function shiftCivilDate(value: string, days: number): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days));
}

/**
 * Reverte somente a suspensao criada pelo bloqueio automatico de inadimplencia.
 * Suspensoes aplicadas manualmente pelo ADM deixam `invoiceOverdueBlockedAt`
 * nulo e, por isso, nunca sao alteradas por uma baixa de fatura.
 */
export async function reactivateCompanyAfterConfirmedInvoicePayment(
  tx: PaymentReactivationTransaction,
  invoiceId: string,
  now: Date,
  changedByUserId: string | null,
): Promise<boolean> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { companyId: true },
  });
  if (!invoice) return false;

  const company = await tx.company.findUnique({
    where: { id: invoice.companyId },
    select: {
      id: true,
      status: true,
      invoiceOverdueBlockedAt: true,
      invoiceOverdueBlockAfterDays: true,
    },
  });
  if (!company || company.status !== 'SUSPENDED' || company.invoiceOverdueBlockedAt === null) {
    return false;
  }

  const blockAfterDays = company.invoiceOverdueBlockAfterDays;
  const where: Prisma.CompanyWhereInput = {
    id: company.id,
    status: 'SUSPENDED',
    invoiceOverdueBlockedAt: { not: null },
  };

  if (blockAfterDays !== null) {
    const overdueCutoff = shiftCivilDate(dateInSaoPaulo(now), -blockAfterDays);
    where.invoiceOverdueBlockAfterDays = blockAfterDays;
    where.invoices = {
      none: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: overdueCutoff },
      },
    };
  }

  const reactivated = await tx.company.updateMany({
    where,
    data: { status: 'ACTIVE', invoiceOverdueBlockedAt: null },
  });
  if (reactivated.count !== 1) return false;

  await tx.companyStatusHistory.create({
    data: {
      companyId: company.id,
      fromStatus: 'SUSPENDED',
      toStatus: 'ACTIVE',
      changedByUserId,
      note: 'Empresa reativada automaticamente após confirmação de pagamento.',
    },
  });
  return true;
}
