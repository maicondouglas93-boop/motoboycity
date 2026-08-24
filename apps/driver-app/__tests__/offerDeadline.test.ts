import { offerDeadline, remainingOfferSeconds } from '../src/lib/offerDeadline';

describe('offer deadline', () => {
  it('usa tempo absoluto e expira imediatamente depois de uma suspensão longa', () => {
    const deadline = offerDeadline(30, 1_000);

    expect(remainingOfferSeconds(deadline, 11_000)).toBe(20);
    expect(remainingOfferSeconds(deadline, 41_000)).toBe(0);
  });
});
