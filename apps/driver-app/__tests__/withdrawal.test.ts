import { isWithdrawalDay, parseWithdrawalAmount } from '../src/lib/withdrawal';

describe('withdrawal helpers', () => {
  it.each([
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1234.56', 1234.56],
    [' 100 ', 100],
  ])('converte %s para %d', (input, expected) => {
    expect(parseWithdrawalAmount(input)).toBe(expected);
  });

  it('usa a segunda-feira no fuso de São Paulo', () => {
    expect(isWithdrawalDay(new Date('2026-08-24T15:00:00.000Z'))).toBe(true);
    expect(isWithdrawalDay(new Date('2026-08-23T15:00:00.000Z'))).toBe(false);
  });
});
