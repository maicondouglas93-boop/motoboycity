import { reactivateCompanyAfterConfirmedInvoicePayment } from './company-payment-reactivation';

const NOW = new Date('2026-09-08T15:00:00.000Z');

function subject(options?: { automaticBlock?: boolean; updateCount?: number }) {
  const tx = {
    invoice: {
      findUnique: jest.fn().mockResolvedValue({ companyId: 'company-1' }),
    },
    company: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'company-1',
        status: 'SUSPENDED',
        invoiceOverdueBlockedAt: options?.automaticBlock === false ? null : NOW,
        invoiceOverdueBlockAfterDays: 7,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
    },
    companyStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  return tx;
}

describe('reactivateCompanyAfterConfirmedInvoicePayment', () => {
  it('reativa a empresa bloqueada automaticamente quando a última dívida bloqueante é quitada', async () => {
    const tx = subject();

    await expect(
      reactivateCompanyAfterConfirmedInvoicePayment(tx as never, 'invoice-1', NOW, 'admin-1'),
    ).resolves.toBe(true);

    expect(tx.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'company-1',
        status: 'SUSPENDED',
        invoiceOverdueBlockedAt: { not: null },
        invoiceOverdueBlockAfterDays: 7,
        invoices: {
          none: {
            status: { in: ['PENDING', 'OVERDUE'] },
            dueDate: { lte: new Date('2026-09-01T00:00:00.000Z') },
          },
        },
      },
      data: { status: 'ACTIVE', invoiceOverdueBlockedAt: null },
    });
    expect(tx.companyStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        fromStatus: 'SUSPENDED',
        toStatus: 'ACTIVE',
        changedByUserId: 'admin-1',
      }),
    });
  });

  it('nunca reativa uma empresa suspensa manualmente pelo ADM', async () => {
    const tx = subject({ automaticBlock: false });

    await expect(
      reactivateCompanyAfterConfirmedInvoicePayment(tx as never, 'invoice-1', NOW, null),
    ).resolves.toBe(false);

    expect(tx.company.updateMany).not.toHaveBeenCalled();
    expect(tx.companyStatusHistory.create).not.toHaveBeenCalled();
  });

  it('mantém a suspensão se ainda existe outra fatura no prazo de bloqueio', async () => {
    const tx = subject({ updateCount: 0 });

    await expect(
      reactivateCompanyAfterConfirmedInvoicePayment(tx as never, 'invoice-1', NOW, null),
    ).resolves.toBe(false);

    expect(tx.company.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoices: {
            none: {
              status: { in: ['PENDING', 'OVERDUE'] },
              dueDate: { lte: new Date('2026-09-01T00:00:00.000Z') },
            },
          },
        }),
      }),
    );
    expect(tx.companyStatusHistory.create).not.toHaveBeenCalled();
  });
});
