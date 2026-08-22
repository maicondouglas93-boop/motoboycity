import { calculatePricing, ReturnNotSupportedError } from './pricing-calculator';

const base = {
  baseFee: 5,
  // Zero reproduz o modelo antigo: por-quilometro desde o metro zero. Os
  // testes abaixo desta constante sao os mesmos de antes da bandeirada
  // existir, e continuam passando sem alteracao.
  includedDistanceKm: 0,
  perKmFee: 1.5,
  minimumFee: 8,
  returnFee: 3,
  requiresReturn: false,
  driverCommissionPercentage: 80,
  // Sem taxa adicional: os testes abaixo sao os de antes da taxa existir, e
  // continuam passando sem alteracao.
  surcharge: null,
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

  describe('bandeirada: valor fixo ate uma distancia', () => {
    // R$ 8 fixos ate 3 km, R$ 1,50 por km depois disso.
    const comBandeirada = { ...base, baseFee: 8, includedDistanceKm: 3, minimumFee: null };

    it.each([0, 1, 2, 3])('cobra so a taxa base a %s km, dentro da bandeirada', (distanceKm) => {
      const result = calculatePricing({ ...comBandeirada, distanceKm });

      expect(result.chargeableDistanceKm).toBe(0);
      expect(result.distanceFee).toBe(0);
      expect(result.subtotal).toBe(8);
    });

    it('cobra por quilometro so no que passa da bandeirada', () => {
      const result = calculatePricing({ ...comBandeirada, distanceKm: 5 });

      // 5 km - 3 inclusos = 2 cobrados; 2 * 1,50 = 3
      expect(result.chargeableDistanceKm).toBe(2);
      expect(result.distanceFee).toBe(3);
      expect(result.subtotal).toBe(11);
    });

    it('nao transforma o perKmFee em desconto abaixo da bandeirada', () => {
      // Sem o piso em zero, 1 km daria -2 km cobrados e o subtotal cairia
      // para 5, abaixo da propria taxa base.
      const result = calculatePricing({ ...comBandeirada, distanceKm: 1 });

      expect(result.subtotal).toBeGreaterThanOrEqual(comBandeirada.baseFee);
    });

    it('a fronteira exata ainda esta inclusa', () => {
      const dentro = calculatePricing({ ...comBandeirada, distanceKm: 3 });
      const fora = calculatePricing({ ...comBandeirada, distanceKm: 3.01 });

      expect(dentro.distanceFee).toBe(0);
      expect(fora.distanceFee).toBeGreaterThan(0);
    });

    it('aceita bandeirada fracionada', () => {
      const result = calculatePricing({ ...comBandeirada, includedDistanceKm: 2.5, distanceKm: 4 });

      expect(result.chargeableDistanceKm).toBe(1.5);
      expect(result.distanceFee).toBe(2.25);
    });

    it('o minimo continua sendo piso, mesmo com bandeirada', () => {
      // Piso de R$ 12 acima da base de R$ 8: entrega curta sobe para 12.
      const result = calculatePricing({ ...comBandeirada, minimumFee: 12, distanceKm: 1 });

      expect(result.subtotal).toBe(12);
    });

    it('rejeita bandeirada negativa', () => {
      expect(() =>
        calculatePricing({ ...comBandeirada, includedDistanceKm: -1, distanceKm: 5 }),
      ).toThrow('includedDistanceKm não pode ser negativo');
    });
  });

  describe('taxa adicional', () => {
    const chuvaPercentual = {
      label: 'Taxa de chuva',
      type: 'PERCENTAGE' as const,
      value: 20,
      driverSharePercentage: 100,
    };

    it('percentual incide sobre o subtotal', () => {
      const result = calculatePricing({ ...base, distanceKm: 5, surcharge: chuvaPercentual });

      // subtotal 12,50; 20% = 2,50
      expect(result.surchargeValue).toBe(2.5);
      expect(result.totalValue).toBe(15);
      expect(result.surchargeLabel).toBe('Taxa de chuva');
    });

    it('valor fixo entra inteiro, independente da distância', () => {
      const fixa = { ...chuvaPercentual, type: 'FIXED' as const, value: 3 };
      const curta = calculatePricing({ ...base, distanceKm: 1, surcharge: fixa });
      const longa = calculatePricing({ ...base, distanceKm: 20, surcharge: fixa });

      expect(curta.surchargeValue).toBe(3);
      expect(longa.surchargeValue).toBe(3);
    });

    it('não incide sobre o retorno', () => {
      // Cobrar percentual em cima do retorno faria a mesma entrega custar mais
      // so por exigir volta, o que ja e cobrado a parte.
      const comRetorno = calculatePricing({
        ...base,
        distanceKm: 5,
        requiresReturn: true,
        surcharge: chuvaPercentual,
      });

      expect(comRetorno.surchargeValue).toBe(2.5);
    });

    it('repasse de 100% leva todo o adicional ao entregador', () => {
      const result = calculatePricing({ ...base, distanceKm: 5, surcharge: chuvaPercentual });

      // Sem taxa: entregador 10, plataforma 2,50. A taxa inteira vai pro
      // entregador, entao a plataforma nao muda.
      expect(result.driverValue).toBe(12.5);
      expect(result.platformValue).toBe(2.5);
    });

    it('repasse de 0% deixa todo o adicional com a plataforma', () => {
      const result = calculatePricing({
        ...base,
        distanceKm: 5,
        surcharge: { ...chuvaPercentual, driverSharePercentage: 0 },
      });

      expect(result.driverValue).toBe(10);
      expect(result.platformValue).toBe(5);
    });

    it('sem taxa, os valores não mudam em nada', () => {
      const semTaxa = calculatePricing({ ...base, distanceKm: 5 });

      expect(semTaxa.surchargeValue).toBe(0);
      expect(semTaxa.surchargeLabel).toBeNull();
      expect(semTaxa.totalValue).toBe(12.5);
    });

    it.each([0, 33.33, 50, 66.67, 100])(
      'invariante driverValue + platformValue === totalValue com repasse de %s%%',
      (share) => {
        const result = calculatePricing({
          ...base,
          distanceKm: 7,
          requiresReturn: true,
          driverCommissionPercentage: 66.67,
          surcharge: { ...chuvaPercentual, driverSharePercentage: share },
        });

        expect(Math.round((result.driverValue + result.platformValue) * 100) / 100).toBe(
          result.totalValue,
        );
      },
    );
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

      expect(Math.round((result.driverValue + result.platformValue) * 100) / 100).toBe(
        result.totalValue,
      );
    },
  );
});
