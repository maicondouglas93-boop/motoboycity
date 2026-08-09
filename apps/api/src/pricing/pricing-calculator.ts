export interface PricingCalculatorInput {
  distanceKm: number;
  baseFee: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  requiresReturn: boolean;
  driverCommissionPercentage: number;
}

export interface PricingCalculatorResult {
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
 * fórmula. driverValue + platformValue === totalValue sempre, por
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

  const distanceFee = roundToCents(input.perKmFee * input.distanceKm);
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

  return { distanceFee, subtotal, returnValue, totalValue, driverValue, platformValue };
}
