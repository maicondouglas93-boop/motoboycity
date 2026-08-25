import {
  approveWithdrawalSchema,
  markWithdrawalPaidSchema,
  rejectWithdrawalSchema,
} from '@motoboycity/validation';

describe('contratos das decisões administrativas de saque', () => {
  const validReason = 'Dados bancários conferidos pelo administrador.';

  it.each([
    ['aprovação', approveWithdrawalSchema],
    ['pagamento', markWithdrawalPaidSchema],
    ['rejeição', rejectWithdrawalSchema],
  ])('exige motivo auditável na %s', (_action, schema) => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ note: 'curto' }).success).toBe(false);
    expect(schema.safeParse({ note: validReason }).success).toBe(true);
  });

  it('mantém a referência do pagamento opcional e limitada', () => {
    expect(markWithdrawalPaidSchema.safeParse({ note: validReason }).success).toBe(true);
    expect(
      markWithdrawalPaidSchema.safeParse({
        note: validReason,
        paymentReference: 'PIX-2026-0001',
      }).success,
    ).toBe(true);
    expect(
      markWithdrawalPaidSchema.safeParse({
        note: validReason,
        paymentReference: 'x'.repeat(181),
      }).success,
    ).toBe(false);
  });
});
