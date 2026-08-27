import {
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
