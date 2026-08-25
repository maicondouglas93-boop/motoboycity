import {
  closeInvoicesSchema,
  listInvoicesQuerySchema,
  manualInvoiceSchema,
  markInvoicePaidSchema,
  updateInvoiceDueDateSchema,
} from '@motoboycity/validation';

describe('contratos de data das faturas', () => {
  it('aceita datas civis existentes', () => {
    expect(closeInvoicesSchema.safeParse({ issueDate: '2028-02-29' }).success).toBe(true);
    expect(
      markInvoicePaidSchema.safeParse({ paymentDate: '2026-08-24', paymentMethod: 'BILLED' })
        .success,
    ).toBe(true);
  });

  it('rejeita datas inexistentes em fechamento, pagamento e filtros', () => {
    expect(closeInvoicesSchema.safeParse({ issueDate: '2026-02-30' }).success).toBe(false);
    expect(
      markInvoicePaidSchema.safeParse({ paymentDate: '2026-13-01', paymentMethod: 'BILLED' })
        .success,
    ).toBe(false);
    expect(listInvoicesQuerySchema.safeParse({ from: '2026-04-31' }).success).toBe(false);
  });

  it('valida a selecao e as datas da fatura manual', () => {
    const base = {
      companyId: '6dfcd2be-3c0b-4d6c-9eb5-f7ef8bdd875a',
      deliveryIds: ['dd086aba-1a92-4c67-b9dd-a9d2e5217159'],
      issueDate: '2026-08-25',
      dueDate: '2026-08-30',
    };

    expect(manualInvoiceSchema.safeParse(base).success).toBe(true);
    expect(manualInvoiceSchema.safeParse({ ...base, dueDate: '2026-08-24' }).success).toBe(false);
    expect(
      manualInvoiceSchema.safeParse({
        ...base,
        deliveryIds: [base.deliveryIds[0], base.deliveryIds[0]],
      }).success,
    ).toBe(false);
  });

  it('exige data valida e motivo auditavel para alterar vencimento', () => {
    expect(
      updateInvoiceDueDateSchema.safeParse({
        dueDate: '2026-09-10',
        reason: 'Prazo renegociado com a empresa.',
      }).success,
    ).toBe(true);
    expect(
      updateInvoiceDueDateSchema.safeParse({ dueDate: '2026-02-30', reason: 'Motivo valido.' })
        .success,
    ).toBe(false);
    expect(
      updateInvoiceDueDateSchema.safeParse({ dueDate: '2026-09-10', reason: 'curto' }).success,
    ).toBe(false);
  });
});
