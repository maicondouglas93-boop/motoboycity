import {
  compareMonths,
  initialMonth,
  isOutsideLimits,
  monthOf,
  monthWeeks,
  shiftMonth,
  spokenDate,
  todayInSaoPaulo,
} from '../src/lib/calendar';

describe('calendário do seletor de datas', () => {
  it('monta outubro de 2026 começando na quinta, com espaços vazios antes do dia 1', () => {
    const semanas = monthWeeks({ year: 2026, month: 9 });

    expect(semanas[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(semanas).toHaveLength(5);
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
    expect(semanas[4]).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
  });

  it('respeita fevereiro bissexto e meses que pedem seis semanas', () => {
    expect(monthWeeks({ year: 2028, month: 1 }).flat().filter(Boolean)).toHaveLength(29);
    expect(monthWeeks({ year: 2026, month: 1 }).flat().filter(Boolean)).toHaveLength(28);
    // Agosto de 2026 começa no sábado e termina na segunda.
    expect(monthWeeks({ year: 2026, month: 7 })).toHaveLength(6);
  });

  it('vira o ano ao andar entre meses', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(compareMonths({ year: 2026, month: 0 }, { year: 2025, month: 11 })).toBeGreaterThan(0);
  });

  it('bloqueia só o que passa dos limites, e limite ausente não limita', () => {
    expect(isOutsideLimits('2026-10-04', undefined, '2026-10-03')).toBe(true);
    expect(isOutsideLimits('2026-10-03', undefined, '2026-10-03')).toBe(false);
    expect(isOutsideLimits('2026-09-30', '2026-10-01', undefined)).toBe(true);
    expect(isOutsideLimits('2020-01-01')).toBe(false);
  });

  it('abre no mês da data marcada; sem ela, no do limite final; sem os dois, no de hoje', () => {
    expect(initialMonth('2026-08-22', '2026-10-03', '2026-10-03')).toEqual({
      year: 2026,
      month: 7,
    });
    expect(initialMonth('', '2026-09-30', '2026-10-03')).toEqual({ year: 2026, month: 8 });
    expect(initialMonth('', undefined, '2026-10-03')).toEqual({ year: 2026, month: 9 });
    expect(monthOf('03/10/2026')).toBeNull();
  });

  it('usa o dia de São Paulo, não o de Greenwich', () => {
    // 23h30 de 3/10 em São Paulo já é 4/10 em UTC.
    expect(todayInSaoPaulo(new Date('2026-10-04T02:30:00Z'))).toBe('2026-10-03');
  });

  it('lê a data por extenso para o leitor de tela', () => {
    expect(spokenDate('2026-10-03')).toBe('3 de outubro de 2026');
  });
});
