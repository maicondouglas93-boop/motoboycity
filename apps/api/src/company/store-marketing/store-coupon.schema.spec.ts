import {
  storeCheckoutSchema,
  storeCouponQuoteSchema,
  storeCouponSchema,
  type StoreCouponInput,
} from '@motoboycity/validation';

/**
 * O cupom que a loja cadastra. Cada recusa diz o campo e o que fazer: quem
 * configura é um lojista pequeno, muitas vezes pelo celular.
 */

const PRODUTO = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const SECAO = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';

const base: StoreCouponInput = {
  codigo: 'BEMVINDO10',
  tipo: 'PERCENTUAL',
  percentual: 10,
  valor: null,
  pedidoMinimo: null,
  descontoMaximo: null,
  inicio: null,
  fim: null,
  limiteDeUsos: null,
  limitePorCliente: null,
  produtoIds: [],
  categoriaIds: [],
  valeEmPromocao: false,
  ativo: true,
};

/** Os campos com erro, do jeito que a tela os mostra. */
function erros(mudancas: Partial<StoreCouponInput>): Record<string, string> {
  const resultado = storeCouponSchema.safeParse({ ...base, ...mudancas });
  if (resultado.success) return {};
  return Object.fromEntries(
    resultado.error.issues.map((problema) => [String(problema.path[0]), problema.message]),
  );
}

describe('storeCouponSchema', () => {
  it('o cupom completo passa; o código vai para maiúsculas, sem espaços', () => {
    const resultado = storeCouponSchema.parse({
      codigo: ' boas-vindas 10 ',
      tipo: 'PERCENTUAL',
      percentual: 10,
    });

    expect(resultado).toMatchObject({
      codigo: 'BOAS-VINDAS10',
      ativo: true,
      valeEmPromocao: false,
      pedidoMinimo: null,
      limiteDeUsos: null,
      limitePorCliente: null,
      produtoIds: [],
      categoriaIds: [],
    });
  });

  it('o cupom nasce escondido do checkout: mostrar é uma escolha da loja', () => {
    expect(
      storeCouponSchema.parse({ codigo: 'BEMVINDO10', tipo: 'PERCENTUAL', percentual: 10 }),
    ).toMatchObject({ mostrarNoCheckout: false });
    expect(
      storeCouponSchema.parse({
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        mostrarNoCheckout: true,
      }),
    ).toMatchObject({ mostrarNoCheckout: true });
  });

  it('o que o tipo não usa é descartado', () => {
    const percentual = storeCouponSchema.parse({ ...base, valor: 30 });
    const fixo = storeCouponSchema.parse({
      ...base,
      tipo: 'VALOR',
      percentual: 50,
      valor: 5,
      descontoMaximo: 10,
    });

    expect(percentual.valor).toBeNull();
    expect(fixo).toMatchObject({ percentual: null, valor: 5, descontoMaximo: null });
  });

  describe('o código', () => {
    it('de 3 a 20 letras, números, hífen ou sublinhado', () => {
      expect(erros({ codigo: 'ABC' })).toEqual({});
      expect(erros({ codigo: 'A'.repeat(20) })).toEqual({});
      for (const invalido of ['AB', 'A'.repeat(21), 'promo!', 'promo#10', 'açaí10', '  ']) {
        expect(erros({ codigo: invalido })).toEqual({
          codigo: 'Use de 3 a 20 letras, números, hífen ou sublinhado, sem espaços.',
        });
      }
    });
  });

  describe('cupom em %', () => {
    it('de 1% a 100%, inteiro', () => {
      expect(erros({ percentual: 1 })).toEqual({});
      expect(erros({ percentual: 100 })).toEqual({});
      for (const invalido of [0, 101, 7.5, -5, null]) {
        expect(erros({ percentual: invalido })).toEqual({
          percentual: 'Use um desconto inteiro de 1% a 100%.',
        });
      }
    });

    it('o teto do desconto é opcional e positivo, com até dois decimais', () => {
      expect(erros({ descontoMaximo: 15 })).toEqual({});
      expect(erros({ descontoMaximo: 0 })).toHaveProperty('descontoMaximo');
      expect(erros({ descontoMaximo: -1 })).toHaveProperty('descontoMaximo');
      expect(erros({ descontoMaximo: 10.999 })).toEqual({
        descontoMaximo: 'Use no máximo dois decimais.',
      });
    });
  });

  describe('cupom de valor fixo', () => {
    const fixo = { tipo: 'VALOR' as const, percentual: null, valor: 5 };

    it('positivo, com até dois decimais', () => {
      expect(erros(fixo)).toEqual({});
      expect(erros({ ...fixo, valor: 0 })).toHaveProperty('valor');
      expect(erros({ ...fixo, valor: -3 })).toHaveProperty('valor');
      expect(erros({ ...fixo, valor: null })).toEqual({ valor: 'Informe o valor do desconto.' });
      expect(erros({ ...fixo, valor: 4.999 })).toEqual({ valor: 'Use no máximo dois decimais.' });
    });
  });

  describe('quando vale', () => {
    it('o pedido mínimo é opcional e positivo', () => {
      expect(erros({ pedidoMinimo: 40 })).toEqual({});
      expect(erros({ pedidoMinimo: 0 })).toEqual({
        pedidoMinimo: 'O pedido mínimo precisa ser maior que zero.',
      });
    });

    it('as datas, com a final depois da inicial', () => {
      expect(erros({ inicio: '2026-10-01', fim: '2026-10-31' })).toEqual({});
      expect(erros({ inicio: '2026-10-01', fim: '2026-10-01' })).toEqual({});
      expect(erros({ inicio: '2026-10-31', fim: '2026-10-01' })).toEqual({
        fim: 'A data final vem antes da inicial.',
      });
      expect(erros({ inicio: '01/10/2026' })).toHaveProperty('inicio');
      expect(erros({ fim: '2026-13-45' })).toHaveProperty('fim');
    });

    it('os limites: inteiros a partir de 1, e o por cliente não passa do total', () => {
      expect(erros({ limiteDeUsos: 100, limitePorCliente: 1 })).toEqual({});
      expect(erros({ limiteDeUsos: 0 })).toHaveProperty('limiteDeUsos');
      expect(erros({ limitePorCliente: 2.5 })).toHaveProperty('limitePorCliente');
      expect(erros({ limiteDeUsos: 5, limitePorCliente: 6 })).toEqual({
        limitePorCliente: 'O limite por cliente não pode passar do limite total.',
      });
      // Sem limite total, o por cliente vale sozinho.
      expect(erros({ limiteDeUsos: null, limitePorCliente: 3 })).toEqual({});
    });
  });

  describe('onde vale', () => {
    it('produtos e seções são ids; repetidos entram uma vez só', () => {
      const resultado = storeCouponSchema.parse({
        ...base,
        produtoIds: [PRODUTO, PRODUTO],
        categoriaIds: [SECAO],
      });

      expect(resultado.produtoIds).toEqual([PRODUTO]);
      expect(resultado.categoriaIds).toEqual([SECAO]);
      expect(erros({ produtoIds: ['acai'] })).toHaveProperty('produtoIds');
      expect(erros({ categoriaIds: ['bebidas'] })).toHaveProperty('categoriaIds');
    });
  });
});

describe('o cupom no pedido e na conferência', () => {
  const itens = [{ produtoId: 'p1', tamanhoId: null, escolhas: [], quantidade: 1 }];

  it('a conferência pede o código e a sacola', () => {
    expect(storeCouponQuoteSchema.safeParse({ cupom: 'BEMVINDO10', itens }).success).toBe(true);
    expect(storeCouponQuoteSchema.safeParse({ cupom: '  ', itens }).success).toBe(false);
    expect(storeCouponQuoteSchema.safeParse({ cupom: 'BEMVINDO10', itens: [] }).success).toBe(
      false,
    );
  });

  it('o pedido leva o cupom ou nada, sem quebrar o pedido de quem não usa', () => {
    const pedido = {
      modalidade: 'RETIRADA',
      itens,
      agendadoPara: null,
      cliente: { nome: 'Ana', telefone: '33999887766' },
      entrega: null,
      pagamento: 'DINHEIRO',
      trocoPara: null,
      observacao: null,
      totalVisto: 10,
    };

    expect(storeCheckoutSchema.safeParse(pedido).success).toBe(true);
    expect(storeCheckoutSchema.safeParse({ ...pedido, cupom: null }).success).toBe(true);
    expect(storeCheckoutSchema.parse({ ...pedido, cupom: ' BEMVINDO10 ' }).cupom).toBe(
      'BEMVINDO10',
    );
    expect(storeCheckoutSchema.safeParse({ ...pedido, cupom: 'X'.repeat(41) }).success).toBe(false);
  });
});
