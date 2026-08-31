import {
  dateInSaoPaulo,
  invoiceClosingCutoff,
  isMondayInSaoPaulo,
  isWithdrawalDayInSaoPaulo,
  withdrawalWeekdayLabel,
  latestInvoiceClosingDateInSaoPaulo,
  latestInvoiceClosingDateForPolicyInSaoPaulo,
  nextInvoiceClosingDateInSaoPaulo,
  nextInvoiceClosingDateForPolicyInSaoPaulo,
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

describe('politica personalizada de fechamento', () => {
  it('respeita qualquer dia da semana e o corte das 00:05', () => {
    const policy = {
      invoiceClosingMode: 'AUTOMATIC' as const,
      invoiceClosingFrequency: 'WEEKLY' as const,
      invoiceClosingWeekday: 3,
      invoiceClosingMonthDay: null,
    };

    expect(
      latestInvoiceClosingDateForPolicyInSaoPaulo(new Date('2026-08-26T03:04:59.000Z'), policy),
    ).toBe('2026-08-19');
    expect(
      latestInvoiceClosingDateForPolicyInSaoPaulo(new Date('2026-08-26T03:05:00.000Z'), policy),
    ).toBe('2026-08-26');
  });

  it('fecha no ultimo dia de fevereiro quando o mensal esta configurado para 31', () => {
    const policy = {
      invoiceClosingMode: 'AUTOMATIC' as const,
      invoiceClosingFrequency: 'MONTHLY' as const,
      invoiceClosingWeekday: null,
      invoiceClosingMonthDay: 31,
    };

    expect(
      latestInvoiceClosingDateForPolicyInSaoPaulo(new Date('2027-02-28T03:05:00.000Z'), policy),
    ).toBe('2027-02-28');
    expect(
      nextInvoiceClosingDateForPolicyInSaoPaulo(new Date('2027-02-28T12:00:00Z'), policy),
    ).toBe('2027-03-31');
  });

  it('preserva 29 de fevereiro em ano bissexto', () => {
    const policy = {
      invoiceClosingMode: 'AUTOMATIC' as const,
      invoiceClosingFrequency: 'MONTHLY' as const,
      invoiceClosingWeekday: null,
      invoiceClosingMonthDay: 30,
    };

    expect(
      latestInvoiceClosingDateForPolicyInSaoPaulo(new Date('2028-02-29T03:05:00.000Z'), policy),
    ).toBe('2028-02-29');
  });

  it('nao promete data quando o fechamento e manual', () => {
    const policy = {
      invoiceClosingMode: 'MANUAL' as const,
      invoiceClosingFrequency: null,
      invoiceClosingWeekday: null,
      invoiceClosingMonthDay: null,
    };

    expect(nextInvoiceClosingDateForPolicyInSaoPaulo(new Date(), policy)).toBeNull();
  });
});

describe('nextInvoiceClosingDateInSaoPaulo', () => {
  /**
   * A regressao que este bloco tranca: a tela da loja dizia "a proxima fatura
   * fecha em 24/08" numa segunda de manha — logo abaixo da fatura FAT-20260824,
   * que ja tinha fechado as 00:05 daquele mesmo dia.
   */
  it('na segunda ANTES das 00:05, o proximo corte ainda e hoje', () => {
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-24T03:04:59.000Z'))).toBe(
      '2026-08-24',
    );
  });

  it('na segunda DEPOIS das 00:05, o corte de hoje ja passou', () => {
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-24T03:05:00.000Z'))).toBe(
      '2026-08-31',
    );
  });

  it('na segunda de manha, aponta para a segunda seguinte', () => {
    // 10h em Sao Paulo: o horario em que a loja de fato abre a tela.
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-24T13:00:00.000Z'))).toBe(
      '2026-08-31',
    );
  });

  it('no meio da semana, aponta para a proxima segunda', () => {
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-26T12:00:00.000Z'))).toBe(
      '2026-08-31',
    );
  });

  it('no domingo, aponta para o dia seguinte', () => {
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-30T12:00:00.000Z'))).toBe(
      '2026-08-31',
    );
  });

  it('atravessa a virada do mes sem escorregar', () => {
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-08-28T12:00:00.000Z'))).toBe(
      '2026-08-31',
    );
    expect(nextInvoiceClosingDateInSaoPaulo(new Date('2026-09-02T12:00:00.000Z'))).toBe(
      '2026-09-07',
    );
  });
});

/**
 * O dia do saque virou configuração do administrador. Estes testes existem
 * porque a regra é avaliada no relógio de SÃO PAULO: em UTC a segunda começa
 * às 21h de domingo, e o motoboy pediria saque num dia que, para ele, ainda
 * não chegou.
 */
describe('dia de solicitar saque', () => {
  // 2026-08-26 é uma quarta-feira.
  const quartaDeManha = new Date('2026-08-26T13:00:00.000Z');
  // 23h de terça em São Paulo já é quarta em UTC — o caso que separa os fusos.
  const terca23hSaoPaulo = new Date('2026-08-26T02:00:00.000Z');

  it('aceita quando o dia bate com o configurado', () => {
    expect(isWithdrawalDayInSaoPaulo(quartaDeManha, 3)).toBe(true);
  });

  it('recusa nos outros dias', () => {
    expect(isWithdrawalDayInSaoPaulo(quartaDeManha, 1)).toBe(false);
    expect(isWithdrawalDayInSaoPaulo(quartaDeManha, 4)).toBe(false);
  });

  /** `null` é escolha do administrador — "qualquer dia" —, não falta de configuração. */
  it('null libera todos os dias', () => {
    expect(isWithdrawalDayInSaoPaulo(quartaDeManha, null)).toBe(true);
    expect(isWithdrawalDayInSaoPaulo(terca23hSaoPaulo, null)).toBe(true);
  });

  it('usa o relógio da operação, e não o UTC', () => {
    // Em UTC já é quarta; em São Paulo ainda é terça.
    expect(terca23hSaoPaulo.getUTCDay()).toBe(3);
    expect(isWithdrawalDayInSaoPaulo(terca23hSaoPaulo, 2)).toBe(true);
    expect(isWithdrawalDayInSaoPaulo(terca23hSaoPaulo, 3)).toBe(false);
  });

  it('nomeia o dia para a mensagem e para a tela', () => {
    expect(withdrawalWeekdayLabel(0)).toBe('domingo');
    expect(withdrawalWeekdayLabel(3)).toBe('quarta-feira');
    expect(withdrawalWeekdayLabel(6)).toBe('sábado');
    expect(withdrawalWeekdayLabel(null)).toBeNull();
  });
});
