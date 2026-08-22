export interface PricingCalculatorInput {
  distanceKm: number;
  baseFee: number;
  /**
   * Distância já coberta pela `baseFee` — a "bandeirada".
   *
   * O `perKmFee` só incide no que passar daqui. Zero reproduz o modelo
   * anterior, em que a cobrança por quilômetro começava no metro zero.
   *
   * É obrigatório e não opcional de propósito: num cálculo de dinheiro, um
   * campo esquecido que assume zero sozinho cobra menos do que devia e ninguém
   * percebe. Melhor o compilador exigir a decisão de quem chama.
   */
  includedDistanceKm: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  requiresReturn: boolean;
  driverCommissionPercentage: number;
}

export interface PricingCalculatorResult {
  /** Quanto da distância passou da bandeirada e foi efetivamente cobrado. */
  chargeableDistanceKm: number;
  distanceFee: number;
  subtotal: number;
  returnValue: number;
  totalValue: number;
  driverValue: number;
  platformValue: number;
}

export class ReturnNotSupportedError extends Error {
  constructor() {
    super('Este tipo de serviço não tem valor de retorno configurado nesta região.');
    this.name = 'ReturnNotSupportedError';
  }
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Motor de cálculo puro — sem I/O, sem Prisma. Quem chama já resolveu a
 * PricingTable ativa e a comissão configurada; esta função só aplica a
 * fórmula:
 *
 *     subtotal = max(baseFee + perKmFee * max(0, distância - bandeirada),
 *                    minimumFee)
 * driverValue + platformValue === totalValue sempre, por
 * construção (platformValue é o resíduo de subtotal - parte do entregador,
 * não uma fórmula independente arredondada separadamente).
 */
export function calculatePricing(input: PricingCalculatorInput): PricingCalculatorResult {
  if (input.distanceKm < 0) {
    throw new Error('distanceKm não pode ser negativo.');
  }
  if (input.driverCommissionPercentage < 0 || input.driverCommissionPercentage > 100) {
    throw new Error('driverCommissionPercentage deve estar entre 0 e 100.');
  }
  if (input.includedDistanceKm < 0) {
    throw new Error('includedDistanceKm não pode ser negativo.');
  }

  /**
   * `Math.max(0, ...)` e não uma subtração direta: entrega mais curta que a
   * bandeirada daria distância negativa e o perKmFee viraria desconto,
   * cobrando menos que a taxa base.
   */
  const chargeableDistanceKm = Math.max(0, input.distanceKm - input.includedDistanceKm);
  const distanceFee = roundToCents(input.perKmFee * chargeableDistanceKm);
  const rawSubtotal = roundToCents(input.baseFee + distanceFee);
  const subtotal =
    input.minimumFee !== null && rawSubtotal < input.minimumFee ? input.minimumFee : rawSubtotal;

  let returnValue = 0;
  if (input.requiresReturn) {
    if (input.returnFee === null) {
      throw new ReturnNotSupportedError();
    }
    returnValue = input.returnFee;
  }

  const driverBasePart = roundToCents(subtotal * (input.driverCommissionPercentage / 100));
  const platformValue = roundToCents(subtotal - driverBasePart);
  const driverValue = roundToCents(driverBasePart + returnValue);
  const totalValue = roundToCents(subtotal + returnValue);

  return {
    chargeableDistanceKm,
    distanceFee,
    subtotal,
    returnValue,
    totalValue,
    driverValue,
    platformValue,
  };
}
