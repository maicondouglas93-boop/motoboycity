import {
  dateInSaoPaulo,
  invoiceClosingCutoff,
  isMondayInSaoPaulo,
  latestInvoiceClosingDateInSaoPaulo,
  nextMondayReleaseAt,
} from './finance-release.utils';

describe('regra semanal de liberação financeira', () => {
  it('usa a próxima segunda para uma entrega concluída no domingo', () => {
    expect(nextMondayReleaseAt(new Date('2026-08-23T12:00:00.000Z')).toISOString()).toBe(
      '2026-08-24T03:00:00.000Z',
    );
  });

  it('não libera no mesmo dia quando a entrega é concluída na segunda', () => {
    expect(nextMondayReleaseAt(new Date('2026-08-24T12:00:00.000Z')).toISOString()).toBe(
      '2026-08-31T03:00:00.000Z',
    );
  });

  it('avalia a segunda-feira no fuso de São Paulo, não no UTC', () => {
    expect(isMondayInSaoPaulo(new Date('2026-08-24T00:30:00.000Z'))).toBe(false);
    expect(isMondayInSaoPaulo(new Date('2026-08-24T12:00:00.000Z'))).toBe(true);
  });

  it('mantém o corte anterior até 00:05 e troca para a segunda atual no horário confirmado', () => {
    expect(latestInvoiceClosingDateInSaoPaulo(new Date('2026-08-24T03:04:59.000Z'))).toBe(
      '2026-08-17',
    );
    expect(latestInvoiceClosingDateInSaoPaulo(new Date('2026-08-24T03:05:00.000Z'))).toBe(
      '2026-08-24',
    );
    expect(latestInvoiceClosingDateInSaoPaulo(new Date('2026-08-26T12:00:00.000Z'))).toBe(
      '2026-08-24',
    );
  });

  it('converte o corte e a data civil no fuso de São Paulo', () => {
    expect(invoiceClosingCutoff('2026-08-24').toISOString()).toBe('2026-08-24T03:05:00.000Z');
    expect(dateInSaoPaulo(new Date('2026-08-25T01:30:00.000Z'))).toBe('2026-08-24');
  });
});
