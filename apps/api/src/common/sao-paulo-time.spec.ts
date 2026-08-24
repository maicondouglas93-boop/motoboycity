import {
  civilDateFromDbDate,
  dateInSaoPaulo,
  endOfDayInSaoPaulo,
  saoPauloDateParts,
  saoPauloLocalToUtc,
  startOfDayInSaoPaulo,
} from './sao-paulo-time';

describe('fuso operacional', () => {
  it('lê a hora do relógio local, e não a do UTC', () => {
    // 00:30 UTC ainda é a noite do dia anterior em São Paulo. Um relatório de
    // horários de pico que usasse UTC jogaria esse pedido na madrugada.
    const parts = saoPauloDateParts(new Date('2026-08-22T00:30:00.000Z'));

    expect(parts.hour).toBe(21);
    expect(parts.day).toBe(21);
    expect(dateInSaoPaulo(new Date('2026-08-22T00:30:00.000Z'))).toBe('2026-08-21');
  });

  it('numera o dia da semana como Date.getDay, com domingo em zero', () => {
    // 21/08/2026 é uma sexta-feira; o instante em UTC já é sábado.
    expect(saoPauloDateParts(new Date('2026-08-22T00:30:00.000Z')).weekday).toBe(5);
    expect(saoPauloDateParts(new Date('2026-08-22T12:00:00.000Z')).weekday).toBe(6);
  });

  it('abre e fecha o dia civil no horário local', () => {
    expect(startOfDayInSaoPaulo('2026-08-22').toISOString()).toBe('2026-08-22T03:00:00.000Z');
    expect(endOfDayInSaoPaulo('2026-08-22').toISOString()).toBe('2026-08-23T02:59:59.999Z');
  });

  it('cobre exatamente 24 horas, sem sobrepor nem furar entre dias consecutivos', () => {
    const fim = endOfDayInSaoPaulo('2026-08-22');
    const proximoInicio = startOfDayInSaoPaulo('2026-08-23');

    expect(proximoInicio.getTime() - fim.getTime()).toBe(1);
    expect(fim.getTime() - startOfDayInSaoPaulo('2026-08-22').getTime()).toBe(
      24 * 60 * 60 * 1000 - 1,
    );
  });

  it('respeita o horário de verão que o Brasil já teve', () => {
    // Em janeiro de 2018 o país estava em UTC-02. Uma constante -3 escrita à
    // mão erraria a meia-noite por uma hora em todo o histórico anterior a
    // 2019 — por isso a regra de fuso vem do Intl, não de aritmética.
    expect(startOfDayInSaoPaulo('2018-01-15').toISOString()).toBe('2018-01-15T02:00:00.000Z');
    expect(startOfDayInSaoPaulo('2018-06-15').toISOString()).toBe('2018-06-15T03:00:00.000Z');
  });

  it('faz o caminho de volta bater com a leitura do relógio', () => {
    const instante = saoPauloLocalToUtc(2026, 8, 22, 19, 30);
    const parts = saoPauloDateParts(instante);

    expect([parts.year, parts.month, parts.day, parts.hour, parts.minute]).toEqual([
      2026, 8, 22, 19, 30,
    ]);
  });

  it('rejeita data mal formada em vez de devolver Invalid Date', () => {
    expect(() => startOfDayInSaoPaulo('22/08/2026')).toThrow(RangeError);
  });
});

describe('civilDateFromDbDate', () => {
  /**
   * A regressao que este bloco tranca: a fatura `FAT-20260824` aparecia como
   * 23/08/2026 na tela da loja. A coluna e `@db.Date` — dia civil, sem hora —
   * e serializa-la como instante fazia a conversao de fuso voltar um dia.
   */
  it('devolve o dia civil de uma coluna @db.Date', () => {
    const doBanco = new Date('2026-08-24T00:00:00.000Z');

    expect(civilDateFromDbDate(doBanco)).toBe('2026-08-24');
  });

  it('NAO converte de fuso: o dia guardado e o dia devolvido', () => {
    // Em Sao Paulo (UTC-3), meia-noite UTC do dia 24 e 21h do dia 23. Aplicar
    // fuso a um dado que nao tem fuso e exatamente o erro que causou o bug.
    const doBanco = new Date('2026-08-24T00:00:00.000Z');

    expect(civilDateFromDbDate(doBanco)).not.toBe(dateInSaoPaulo(doBanco));
    expect(dateInSaoPaulo(doBanco)).toBe('2026-08-23');
  });

  it('atravessa a virada do ano sem escorregar', () => {
    expect(civilDateFromDbDate(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');
  });
});
