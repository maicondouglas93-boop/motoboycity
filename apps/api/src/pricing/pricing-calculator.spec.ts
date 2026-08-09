import { calculatePricing, ReturnNotSupportedError } from './pricing-calculator';

const base = {
  baseFee: 5,
  perKmFee: 1.5,
  minimumFee: 8,
  returnFee: 3,
  requiresReturn: false,
  driverCommissionPercentage: 80,
};

describe('calculatePricing', () => {
  it('calcula base + distância quando acima do mínimo', () => {
    const result = calculatePricing({ ...base, distanceKm: 5 });

    // distanceFee = 1.5 * 5 = 7.5; subtotal = 5 + 7.5 = 12.5 (> minimumFee 8)
    expect(result.distanceFee).toBe(7.5);
    expect(result.subtotal).toBe(12.5);
    expect(result.returnValue).toBe(0);
    expect(result.totalValue).toBe(12.5);
  });

  it('distância zero: subtotal cai no mínimo configurado', () => {
    const result = calculatePricing({ ...base, distanceKm: 0 });

    // distanceFee = 0; rawSubtotal = 5 (< minimumFee 8) → aplica o piso
    expect(result.distanceFee).toBe(0);
    expect(result.subtotal).toBe(8);
    expect(result.totalValue).toBe(8);
  });

  it('sem minimumFee configurado, não aplica piso nenhum', () => {
    const result = calculatePricing({ ...base, minimumFee: null, distanceKm: 0 });

    expect(result.subtotal).toBe(5);
  });

  it('cobre retorno: soma returnFee ao total, sem comissão da plataforma sobre ele', () => {
    const result = calculatePricing({ ...base, distanceKm: 5, requiresReturn: true });

    // subtotal 12.5, comissão 80% → driverBasePart = 10, platformValue = 2.5
    // returnValue = 3, 100% pro entregador
    expect(result.returnValue).toBe(3);
    expect(result.totalValue).toBe(15.5);
    expect(result.driverValue).toBe(13); // 10 + 3
    expect(result.platformValue).toBe(2.5); // não muda com o retorno
  });

  it('requiresReturn=true com returnFee não configurado (null) lança ReturnNotSupportedError', () => {
    expect(() =>
      calculatePricing({ ...base, returnFee: null, distanceKm: 5, requiresReturn: true }),
    ).toThrow(ReturnNotSupportedError);
  });

  it('requiresReturn=false ignora returnFee mesmo se configurado', () => {
    const result = calculatePricing({ ...base, distanceKm: 5, requiresReturn: false });

    expect(result.returnValue).toBe(0);
  });

  it('rejeita distanceKm negativo', () => {
    expect(() => calculatePricing({ ...base, distanceKm: -1 })).toThrow(
      'distanceKm não pode ser negativo',
    );
  });

  it('rejeita driverCommissionPercentage fora de 0-100', () => {
    expect(() =>
      calculatePricing({ ...base, distanceKm: 5, driverCommissionPercentage: 101 }),
    ).toThrow('driverCommissionPercentage deve estar entre 0 e 100');
  });

  it('comissão 0%: entregador só recebe o retorno, plataforma fica com o subtotal inteiro', () => {
    const result = calculatePricing({
      ...base,
      distanceKm: 5,
      requiresReturn: true,
      driverCommissionPercentage: 0,
    });

    expect(result.driverValue).toBe(3); // só o retorno
    expect(result.platformValue).toBe(12.5); // subtotal inteiro
  });

  it('comissão 100%: plataforma fica com zero do subtotal', () => {
    const result = calculatePricing({ ...base, distanceKm: 5, driverCommissionPercentage: 100 });

    expect(result.driverValue).toBe(12.5);
    expect(result.platformValue).toBe(0);
  });

  it.each([0, 20, 33.33, 50, 66.67, 80, 100])(
    'invariante driverValue + platformValue === totalValue para comissão %s%%',
    (commission) => {
      const result = calculatePricing({
        ...base,
        distanceKm: 7,
        requiresReturn: true,
        driverCommissionPercentage: commission,
      });

      expect(
        Math.round((result.driverValue + result.platformValue) * 100) / 100,
      ).toBe(result.totalValue);
    },
  );
});
