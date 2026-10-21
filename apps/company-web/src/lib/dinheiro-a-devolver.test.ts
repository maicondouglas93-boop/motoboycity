import { describe, expect, it } from 'vitest';
import { dinheiroADevolver, lembreteDoRetorno } from './dinheiro-a-devolver';

const voltando = { requiresReturn: true, cashToReturn: 85.5, status: 'DELIVERED' as const };

describe('dinheiroADevolver', () => {
  it('mostra o valor que o motoboy informou', () => {
    expect(dinheiroADevolver(voltando)).toMatch(/^R\$\s85,50 em dinheiro$/);
  });

  it('diz quando ele não recebeu dinheiro', () => {
    expect(dinheiroADevolver({ ...voltando, cashToReturn: 0 })).toBe(
      'Motoboy não recebeu dinheiro',
    );
  });

  it('avisa o "não informado" só enquanto ele volta à loja', () => {
    expect(dinheiroADevolver({ ...voltando, cashToReturn: null })).toBe(
      'Não informado pelo motoboy',
    );
    expect(dinheiroADevolver({ ...voltando, cashToReturn: null, status: 'COMPLETED' })).toBeNull();
    expect(dinheiroADevolver({ ...voltando, cashToReturn: null, status: 'COLLECTED' })).toBeNull();
  });

  it('pedido sem retorno não tem dinheiro a devolver', () => {
    expect(dinheiroADevolver({ ...voltando, requiresReturn: false })).toBeNull();
  });
});

describe('lembreteDoRetorno', () => {
  it('aparece no card enquanto ele traz dinheiro', () => {
    expect(lembreteDoRetorno(voltando)).toMatch(/^Traz R\$\s85,50 em dinheiro$/);
  });

  it('some quando não há dinheiro ou o retorno terminou', () => {
    expect(lembreteDoRetorno({ ...voltando, cashToReturn: 0 })).toBeNull();
    expect(lembreteDoRetorno({ ...voltando, cashToReturn: null })).toBeNull();
    expect(lembreteDoRetorno({ ...voltando, status: 'COMPLETED' })).toBeNull();
  });
});
