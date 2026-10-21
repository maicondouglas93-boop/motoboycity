import type { PendingDeliveryCompletion } from '../src/lib/deliveryCompletionOutbox';
import {
  comPosicaoNova,
  conferirDinheiro,
  DINHEIRO_EM_BRANCO,
  dinheiroJaInformado,
  lembreteDoDinheiro,
  lembreteNaLista,
  lerReais,
} from '../src/lib/cashToReturn';

/** O formatador do Hermes e do Node separam "R$" do número com espaço comum ou fixo. */
const R$ = (valor: string) => new RegExp(`R\\$\\s${valor.replace('.', '\\.')}`);

describe('lerReais', () => {
  it('entende o jeito que o motoboy digita', () => {
    expect(lerReais('85')).toBe(85);
    expect(lerReais('85,5')).toBe(85.5);
    expect(lerReais('85,50')).toBe(85.5);
    expect(lerReais('1.234,56')).toBe(1234.56);
    expect(lerReais('R$ 85,50')).toBe(85.5);
    expect(lerReais(' 85.50 ')).toBe(85.5);
  });

  it('recusa o que não é um valor', () => {
    expect(lerReais('')).toBeNull();
    expect(lerReais('oitenta')).toBeNull();
    expect(lerReais('-5')).toBeNull();
    expect(lerReais('85,555')).toBeNull();
  });
});

describe('conferirDinheiro', () => {
  it('em branco ainda não dá para confirmar, sem bronca', () => {
    expect(conferirDinheiro(DINHEIRO_EM_BRANCO)).toEqual({ pronto: false, aviso: null });
  });

  it('"Não recebi dinheiro" confirma com zero', () => {
    expect(conferirDinheiro({ texto: '', semDinheiro: true })).toEqual({ pronto: true, valor: 0 });
  });

  it('valor digitado confirma com o valor', () => {
    expect(conferirDinheiro({ texto: '85,50', semDinheiro: false })).toEqual({
      pronto: true,
      valor: 85.5,
    });
  });

  it('zero digitado manda usar o "Não recebi dinheiro"', () => {
    expect(conferirDinheiro({ texto: '0', semDinheiro: false })).toMatchObject({
      pronto: false,
      aviso: expect.stringContaining('Não recebi dinheiro'),
    });
  });

  it('texto que não é valor e valor alto demais pedem conferência', () => {
    expect(conferirDinheiro({ texto: 'abc', semDinheiro: false }).pronto).toBe(false);
    expect(conferirDinheiro({ texto: '10.000,01', semDinheiro: false }).pronto).toBe(false);
  });
});

describe('dinheiroJaInformado', () => {
  it('reabre o modal com o que ficou salvo na fila', () => {
    expect(dinheiroJaInformado(undefined)).toEqual(DINHEIRO_EM_BRANCO);
    expect(dinheiroJaInformado(0)).toEqual({ texto: '', semDinheiro: true });
    expect(dinheiroJaInformado(85.5)).toEqual({ texto: '85,50', semDinheiro: false });
  });
});

describe('lembreteDoDinheiro', () => {
  it('lembra o valor, ou que não houve dinheiro', () => {
    expect(lembreteDoDinheiro(85.5)).toMatch(R$('85,50'));
    expect(lembreteDoDinheiro(85.5)).toMatch(/em dinheiro à loja\.$/);
    expect(lembreteDoDinheiro(0)).toBe('Você informou que não recebeu dinheiro do cliente.');
  });

  it('não informado não vira lembrete', () => {
    expect(lembreteDoDinheiro(null)).toBeNull();
    expect(lembreteDoDinheiro(undefined)).toBeNull();
  });
});

describe('lembreteNaLista', () => {
  const pedido = {
    id: 'delivery-1',
    status: 'DELIVERED' as const,
    requiresReturn: true,
    cashToReturn: 85.5,
  };

  function pendente(cashToReturn?: number): PendingDeliveryCompletion {
    return {
      id: 'deliver-1',
      ownerUserId: 'user-1',
      action: 'DELIVER',
      deliveryId: 'delivery-1',
      batchId: null,
      groupKey: 'delivery-1',
      displayNumber: 15,
      companyName: 'Loja A',
      queuedAt: new Date().toISOString(),
      state: 'PENDING',
      lastError: null,
      payload: cashToReturn === undefined ? {} : { cashToReturn },
    };
  }

  it('mostra o valor confirmado pelo servidor enquanto ele volta à loja', () => {
    expect(lembreteNaLista(pedido, [])).toMatch(R$('85,50'));
  });

  it('sem internet, mostra o valor guardado na fila do aparelho', () => {
    const coletado = { ...pedido, status: 'COLLECTED' as const, cashToReturn: null };
    expect(lembreteNaLista(coletado, [pendente(40)])).toMatch(R$('40,00'));
  });

  it('antes de entregar e em pedido sem retorno, não há o que lembrar', () => {
    expect(lembreteNaLista({ ...pedido, status: 'COLLECTED', cashToReturn: null }, [])).toBeNull();
    expect(lembreteNaLista({ ...pedido, requiresReturn: false }, [])).toBeNull();
  });
});

describe('comPosicaoNova', () => {
  const fix = { lat: -20.1, lng: -41.6, accuracy: 15 };

  it('troca a posição e mantém o dinheiro informado', () => {
    expect(comPosicaoNova({ lat: 1, lng: 2, accuracy: 300, cashToReturn: 85.5 }, fix)).toEqual({
      ...fix,
      cashToReturn: 85.5,
    });
  });

  it('vale o valor novo quando ele confirmou de novo', () => {
    expect(comPosicaoNova({ cashToReturn: 85.5 }, { ...fix, cashToReturn: 90 })).toEqual({
      ...fix,
      cashToReturn: 90,
    });
  });

  it('sem dinheiro informado, é só a posição', () => {
    expect(comPosicaoNova({ lat: 1, lng: 2 }, fix)).toEqual(fix);
  });
});
