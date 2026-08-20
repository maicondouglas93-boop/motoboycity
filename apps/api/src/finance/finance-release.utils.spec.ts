import { isMondayInSaoPaulo, nextMondayReleaseAt } from './finance-release.utils';

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
});
