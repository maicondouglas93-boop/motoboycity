import {
  closeInvoicesSchema,
  listInvoicesQuerySchema,
  markInvoicePaidSchema,
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
});
