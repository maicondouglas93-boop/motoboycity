import {
  defaultHistoryPeriod,
  formatHistoryDate,
  normalizeHistoryDate,
  normalizeHistoryPeriod,
} from '../src/lib/historyPeriod';

describe('filtro de período do histórico do motoboy', () => {
  it('converte a data brasileira exibida no app para o formato aceito pela API', () => {
    expect(normalizeHistoryPeriod('27/08/2026', '28/08/2026')).toEqual({
      from: '2026-08-27',
      to: '2026-08-28',
    });
  });

  it('mantém compatibilidade com data ISO e permite uma das pontas vazia', () => {
    expect(normalizeHistoryPeriod('2026-08-27', '')).toEqual({ from: '2026-08-27' });
    expect(normalizeHistoryPeriod('', '')).toEqual({});
  });

  it('rejeita data inexistente e período invertido', () => {
    expect(normalizeHistoryDate('31/02/2026')).toBeNull();
    expect(normalizeHistoryPeriod('28/08/2026', '27/08/2026')).toBeNull();
  });

  it('apresenta o período aplicado no formato brasileiro', () => {
    expect(formatHistoryDate('2026-08-27')).toBe('27/08/2026');
  });
});

describe('periodo padrao do historico', () => {
  it('abre nos ultimos 30 dias em vez de pedir a vida inteira', () => {
    const periodo = defaultHistoryPeriod(new Date('2026-09-21T12:00:00Z'));

    expect(periodo).toEqual({ from: '2026-08-22', to: '2026-09-21' });
  });

  it('usa datas que o proprio filtro da tela aceita', () => {
    const periodo = defaultHistoryPeriod(new Date('2026-01-05T03:00:00Z'));

    // Atravessa a virada de ano sem inventar data invalida.
    expect(periodo.from).toBe('2025-12-06');
    expect(normalizeHistoryPeriod(periodo.from ?? '', periodo.to ?? '')).toEqual(periodo);
  });
});
