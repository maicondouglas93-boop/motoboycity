import {
  offerDeadline,
  remainingOfferSeconds,
  stableOfferDeadline,
} from '../src/lib/offerDeadline';

describe('offer deadline', () => {
  it('usa tempo absoluto e expira imediatamente depois de uma suspensão longa', () => {
    const deadline = offerDeadline(30, 1_000);

    expect(remainingOfferSeconds(deadline, 11_000)).toBe(20);
    expect(remainingOfferSeconds(deadline, 41_000)).toBe(0);
  });

  it('nunca estende o prazo quando a mesma oferta chega novamente', () => {
    const first = stableOfferDeadline(null, null, 'offer-1', 60, { nowMs: 1_000 });
    const repeated = stableOfferDeadline('offer-1', first, 'offer-1', 60, { nowMs: 11_000 });

    expect(first).toBe(61_000);
    expect(repeated).toBe(first);
  });

  it('aceita um prazo menor informado para a mesma oferta', () => {
    const deadline = stableOfferDeadline('offer-1', 61_000, 'offer-1', 20, { nowMs: 20_000 });

    expect(deadline).toBe(40_000);
  });

  it('inicia um novo prazo quando muda a oferta', () => {
    const deadline = stableOfferDeadline('offer-1', 61_000, 'offer-2', 60, { nowMs: 20_000 });

    expect(deadline).toBe(80_000);
  });

  it('usa a expiracao do servidor quando a primeira mensagem chega atrasada', () => {
    const deadline = stableOfferDeadline(null, null, 'offer-1', 60, {
      expiresAtEpochMs: 61_000,
      nowMs: 41_000,
    });

    expect(deadline).toBe(61_000);
    expect(remainingOfferSeconds(deadline, 41_000)).toBe(20);
  });

  it('mantem compatibilidade com API antiga sem expiracao absoluta', () => {
    expect(stableOfferDeadline(null, null, 'offer-1', 60, { nowMs: 41_000 })).toBe(101_000);
  });
});
