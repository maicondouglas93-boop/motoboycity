import { adminUpdateCompanyBillingSettingsSchema } from '@motoboycity/validation';

describe('configuracao de faturamento por empresa', () => {
  const overdue = { invoiceOverdueBlockAfterDays: 7 };

  it('aceita fechamento manual sem agenda', () => {
    expect(
      adminUpdateCompanyBillingSettingsSchema.safeParse({
        invoiceClosingMode: 'MANUAL',
        invoiceClosingFrequency: null,
        invoiceClosingWeekday: null,
        invoiceClosingMonthDay: null,
        ...overdue,
      }).success,
    ).toBe(true);
  });

  it('aceita semanal e mensal com o respectivo dia', () => {
    expect(
      adminUpdateCompanyBillingSettingsSchema.safeParse({
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'WEEKLY',
        invoiceClosingWeekday: 5,
        invoiceClosingMonthDay: null,
        ...overdue,
      }).success,
    ).toBe(true);
    expect(
      adminUpdateCompanyBillingSettingsSchema.safeParse({
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'MONTHLY',
        invoiceClosingWeekday: null,
        invoiceClosingMonthDay: 31,
        invoiceOverdueBlockAfterDays: null,
      }).success,
    ).toBe(true);
  });

  it('rejeita dias incompatíveis e prazo de bloqueio fora do limite', () => {
    expect(
      adminUpdateCompanyBillingSettingsSchema.safeParse({
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'WEEKLY',
        invoiceClosingWeekday: null,
        invoiceClosingMonthDay: 10,
        ...overdue,
      }).success,
    ).toBe(false);
    expect(
      adminUpdateCompanyBillingSettingsSchema.safeParse({
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'MONTHLY',
        invoiceClosingWeekday: null,
        invoiceClosingMonthDay: 32,
        invoiceOverdueBlockAfterDays: 0,
      }).success,
    ).toBe(false);
  });
});
