import { BadRequestException } from '@nestjs/common';
import { resolveVirtualSecretaryPeriod } from './virtual-secretary-period';

describe('resolveVirtualSecretaryPeriod', () => {
  const now = new Date('2026-08-23T15:00:00.000Z');

  it('resolve hoje e ontem no calendário de São Paulo', () => {
    expect(resolveVirtualSecretaryPeriod('TODAY', undefined, now)).toMatchObject({
      from: '2026-08-23',
      to: '2026-08-23',
    });
    expect(resolveVirtualSecretaryPeriod('YESTERDAY', undefined, now)).toMatchObject({
      from: '2026-08-22',
      to: '2026-08-22',
    });
  });

  it('usa segunda a domingo para a semana anterior', () => {
    expect(resolveVirtualSecretaryPeriod('LAST_WEEK', undefined, now)).toMatchObject({
      from: '2026-08-10',
      to: '2026-08-16',
    });
  });

  it('recusa período personalizado invertido', () => {
    expect(() =>
      resolveVirtualSecretaryPeriod('CUSTOM', { from: '2026-08-23', to: '2026-08-22' }, now),
    ).toThrow(BadRequestException);
  });
});
