import type { PromocaoPublica } from '@motoboycity/types';
import {
  aplicarPromocoes,
  descontoDaPromocao,
  emCentavos,
  emReais,
  ofertaDoProduto,
  promocaoVigente,
  rotuloDaPromocao,
  type LinhaParaPrecificar,
} from '@motoboycity/validation';

/**
 * O preço com promoção: a mesma conta na vitrine, no checkout e no servidor. O
 * servidor recusa o pedido cujo total não bate com o que o cliente viu, então
 * qualquer diferença aqui vira "o total mudou" para um cliente que não errou.
 */

/** Quarta-feira, 23/09/2026, meio-dia na hora da loja (UTC-3). */
const QUARTA = new Date('2026-09-23T12:00:00-03:00');

function promocao(mudancas: Partial<PromocaoPublica> = {}): PromocaoPublica {
  return {
    id: 'promo-1',
    nome: 'Oferta',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: 'acai',
    categoriaId: null,
    percentual: 20,
    precoPromocional: null,
    leve: null,
    pague: null,
    inicio: null,
    fim: null,
    horaInicio: null,
    horaFim: null,
    diasDaSemana: [],
    ...mudancas,
  };
}

function linha(mudancas: Partial<LinhaParaPrecificar> = {}): LinhaParaPrecificar {
  return {
    chave: '0',
    produtoId: 'acai',
    categoriaId: 'doces',
    tamanhoId: null,
    quantidade: 1,
    baseCentavos: 2000,
    adicionaisCentavos: 0,
    ...mudancas,
  };
}

describe('reais e centavos', () => {
  it('convertem sem o erro de ponto flutuante', () => {
    expect(emCentavos(0.1 + 0.2)).toBe(30);
    expect(emCentavos(16.9)).toBe(1690);
    expect(emReais(1690)).toBe(16.9);
  });
});

describe('promocaoVigente', () => {
  it('sem nenhuma restrição, vale sempre', () => {
    expect(promocaoVigente(promocao(), QUARTA)).toBe(true);
  });

  it('as datas são do calendário da loja e incluem as duas pontas', () => {
    const outubro = promocao({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(promocaoVigente(outubro, new Date('2026-09-30T23:59:00-03:00'))).toBe(false);
    expect(promocaoVigente(outubro, new Date('2026-10-01T00:00:00-03:00'))).toBe(true);
    expect(promocaoVigente(outubro, new Date('2026-10-31T23:59:00-03:00'))).toBe(true);
    expect(promocaoVigente(outubro, new Date('2026-11-01T00:00:00-03:00'))).toBe(false);
  });

  it('meia-noite no UTC ainda é o dia anterior na loja', () => {
    // 01/10 às 01:00 UTC é 30/09 às 22:00 em São Paulo.
    const doMes = promocao({ inicio: '2026-10-01' });
    expect(promocaoVigente(doMes, new Date('2026-10-01T01:00:00Z'))).toBe(false);
    expect(promocaoVigente(doMes, new Date('2026-10-01T03:00:00Z'))).toBe(true);
  });

  it('os dias da semana valem no calendário da loja (0 é domingo)', () => {
    const fimDeSemana = promocao({ diasDaSemana: [0, 6] });
    expect(promocaoVigente(fimDeSemana, QUARTA)).toBe(false);
    expect(promocaoVigente(fimDeSemana, new Date('2026-09-26T12:00:00-03:00'))).toBe(true);
    expect(promocaoVigente(fimDeSemana, new Date('2026-09-27T12:00:00-03:00'))).toBe(true);
  });

  it('o horário do dia: começa incluído e termina excluído', () => {
    const almoco = promocao({ horaInicio: '11:00', horaFim: '14:00' });
    const as = (relogio: string) => new Date(`2026-09-23T${relogio}:00-03:00`);
    expect(promocaoVigente(almoco, as('10:59'))).toBe(false);
    expect(promocaoVigente(almoco, as('11:00'))).toBe(true);
    expect(promocaoVigente(almoco, as('13:59'))).toBe(true);
    expect(promocaoVigente(almoco, as('14:00'))).toBe(false);
  });

  it('horário que passa da meia-noite vale nos dois lados, e o dia da semana é o do começo', () => {
    // Sexta e sábado à noite, das 22h às 2h.
    const balada = promocao({ horaInicio: '22:00', horaFim: '02:00', diasDaSemana: [5, 6] });
    // Sexta 23:00: dentro. Sábado 01:00: ainda é a noite de sexta, dentro.
    expect(promocaoVigente(balada, new Date('2026-09-25T23:00:00-03:00'))).toBe(true);
    expect(promocaoVigente(balada, new Date('2026-09-26T01:00:00-03:00'))).toBe(true);
    // Sábado 03:00 já passou do fim; sábado 21:00 ainda não começou.
    expect(promocaoVigente(balada, new Date('2026-09-26T03:00:00-03:00'))).toBe(false);
    expect(promocaoVigente(balada, new Date('2026-09-26T21:00:00-03:00'))).toBe(false);
    // Domingo 01:00 é a madrugada da noite de sábado: dentro.
    expect(promocaoVigente(balada, new Date('2026-09-27T01:00:00-03:00'))).toBe(true);
    // Segunda 01:00 é a madrugada do domingo, que não está na lista.
    expect(promocaoVigente(balada, new Date('2026-09-28T01:00:00-03:00'))).toBe(false);
  });

  it('a madrugada do último dia ainda conta para a promoção que terminou "ontem à noite"', () => {
    const fimDeSemana = promocao({ horaInicio: '22:00', horaFim: '02:00', fim: '2026-09-25' });
    expect(promocaoVigente(fimDeSemana, new Date('2026-09-26T01:00:00-03:00'))).toBe(true);
    expect(promocaoVigente(fimDeSemana, new Date('2026-09-26T23:00:00-03:00'))).toBe(false);
  });

  it('o mesmo horário de início e fim é o dia inteiro', () => {
    const dia = promocao({ horaInicio: '00:00', horaFim: '00:00' });
    expect(promocaoVigente(dia, new Date('2026-09-23T03:30:00-03:00'))).toBe(true);
  });
});

describe('descontoDaPromocao', () => {
  it('percentual: por unidade, arredondado ao centavo', () => {
    expect(descontoDaPromocao(promocao(), 2000, 1)).toBe(400);
    expect(descontoDaPromocao(promocao(), 2000, 3)).toBe(1200);
    // 10% de R$ 9,99 são R$ 0,999: 1 centavo a mais, em cada unidade.
    expect(descontoDaPromocao(promocao({ percentual: 10 }), 999, 1)).toBe(100);
    expect(descontoDaPromocao(promocao({ percentual: 10 }), 999, 2)).toBe(200);
  });

  it('preço promocional: a diferença, e nunca um aumento', () => {
    const pizza = promocao({ tipo: 'PRECO', percentual: null, precoPromocional: 39.9 });
    expect(descontoDaPromocao(pizza, 4500, 1)).toBe(510);
    expect(descontoDaPromocao(pizza, 4500, 2)).toBe(1020);
    // O produto já custa menos que o "preço promocional": a promoção não age.
    expect(descontoDaPromocao(pizza, 3500, 1)).toBe(0);
  });

  it('leve X, pague Y: um brinde a cada X unidades', () => {
    const leve3 = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 });
    expect(descontoDaPromocao(leve3, 1000, 2)).toBe(0);
    expect(descontoDaPromocao(leve3, 1000, 3)).toBe(1000);
    expect(descontoDaPromocao(leve3, 1000, 5)).toBe(1000);
    expect(descontoDaPromocao(leve3, 1000, 7)).toBe(2000);
    // Leve 4, pague 2: dois brindes a cada quatro.
    const leve4 = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 4, pague: 2 });
    expect(descontoDaPromocao(leve4, 1000, 4)).toBe(2000);
  });

  it('segundo com desconto: um desconto a cada par', () => {
    const segundo = promocao({ tipo: 'SEGUNDO_COM_DESCONTO', percentual: 50 });
    expect(descontoDaPromocao(segundo, 1000, 1)).toBe(0);
    expect(descontoDaPromocao(segundo, 1000, 2)).toBe(500);
    expect(descontoDaPromocao(segundo, 1000, 5)).toBe(1000);
  });

  it('campos que faltam, ou preço e quantidade zerados, não descontam nada', () => {
    expect(descontoDaPromocao(promocao({ percentual: null }), 2000, 1)).toBe(0);
    expect(descontoDaPromocao(promocao(), 0, 1)).toBe(0);
    expect(descontoDaPromocao(promocao(), 2000, 0)).toBe(0);
    // "Leve 3, pague 3" não é promoção.
    expect(
      descontoDaPromocao(
        promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 3 }),
        1000,
        6,
      ),
    ).toBe(0);
  });
});

describe('rotuloDaPromocao', () => {
  it('diz do jeito que o cliente lê', () => {
    expect(rotuloDaPromocao(promocao())).toBe('20% OFF');
    expect(rotuloDaPromocao(promocao({ tipo: 'PRECO', precoPromocional: 39.9 }))).toBe(
      'Preço especial',
    );
    expect(rotuloDaPromocao(promocao({ tipo: 'LEVE_PAGUE', leve: 3, pague: 2 }))).toBe(
      'Leve 3, pague 2',
    );
    expect(rotuloDaPromocao(promocao({ tipo: 'SEGUNDO_COM_DESCONTO', percentual: 50 }))).toBe(
      '2º com 50% OFF',
    );
    expect(rotuloDaPromocao(promocao({ tipo: 'SEGUNDO_COM_DESCONTO', percentual: 100 }))).toBe(
      'Leve 2, o 2º é grátis',
    );
  });
});

describe('aplicarPromocoes', () => {
  it('sem promoção, nada muda', () => {
    const { linhas, usadas } = aplicarPromocoes([linha({ quantidade: 2 })], [], QUARTA);

    expect(linhas[0]).toMatchObject({
      originalCentavos: 4000,
      descontoCentavos: 0,
      totalCentavos: 4000,
      promocaoId: null,
    });
    expect(usadas).toEqual([]);
  });

  it('o desconto age sobre o produto, e não sobre os adicionais', () => {
    // Açaí de R$ 20 com R$ 5 de adicionais, 20% OFF: tira R$ 4, e não R$ 5.
    const { linhas } = aplicarPromocoes([linha({ adicionaisCentavos: 500 })], [promocao()], QUARTA);

    expect(linhas[0]).toMatchObject({
      originalCentavos: 2500,
      descontoCentavos: 400,
      totalCentavos: 2100,
      promocaoId: 'promo-1',
    });
  });

  it('promoção fora da hora, ou de outro produto, não age', () => {
    const { linhas, usadas } = aplicarPromocoes(
      [linha()],
      [
        promocao({ id: 'a', fim: '2026-09-22' }),
        promocao({ id: 'b', produtoId: 'pizza' }),
        promocao({ id: 'c', diasDaSemana: [0] }),
      ],
      QUARTA,
    );

    expect(linhas[0]!.descontoCentavos).toBe(0);
    expect(usadas).toEqual([]);
  });

  it('não acumula: cada produto recebe UMA promoção, a que mais baixa o preço', () => {
    const { linhas, usadas } = aplicarPromocoes(
      [linha({ quantidade: 2 })],
      [
        promocao({ id: 'vinte', percentual: 20 }),
        promocao({ id: 'trinta', percentual: 30 }),
        promocao({ id: 'segundo', tipo: 'SEGUNDO_COM_DESCONTO', percentual: 50 }),
      ],
      QUARTA,
    );

    // 30% de 2 x R$ 20 = R$ 12; o segundo com 50% tiraria só R$ 10.
    expect(linhas[0]).toMatchObject({ descontoCentavos: 1200, promocaoId: 'trinta' });
    expect(usadas).toEqual(['trinta']);
  });

  it('empate: vale a primeira da lista, para a página e o servidor escolherem igual', () => {
    const { linhas } = aplicarPromocoes(
      [linha()],
      [promocao({ id: 'primeira', percentual: 20 }), promocao({ id: 'segunda', percentual: 20 })],
      QUARTA,
    );

    expect(linhas[0]!.promocaoId).toBe('primeira');
  });

  it('a promoção da seção vale para os produtos dela, e a do produto pode ganhar dela', () => {
    const doces = promocao({
      id: 'secao',
      alvo: 'CATEGORIA',
      produtoId: null,
      categoriaId: 'doces',
      percentual: 10,
    });
    const soAcai = promocao({ id: 'acai-15', percentual: 15 });
    const { linhas } = aplicarPromocoes(
      [
        linha({ chave: 'acai' }),
        linha({ chave: 'sorvete', produtoId: 'sorvete', baseCentavos: 800 }),
        linha({ chave: 'suco', produtoId: 'suco', categoriaId: 'bebidas', baseCentavos: 600 }),
      ],
      [doces, soAcai],
      QUARTA,
    );

    expect(linhas.map((item) => [item.chave, item.promocaoId, item.descontoCentavos])).toEqual([
      ['acai', 'acai-15', 300],
      ['sorvete', 'secao', 80],
      ['suco', null, 0],
    ]);
  });

  it('leve 3, pague 2 conta as unidades do mesmo produto, ainda que em linhas separadas', () => {
    const leve3 = promocao({ id: 'leve', tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 });
    const { linhas, usadas } = aplicarPromocoes(
      [
        linha({ chave: 'a', quantidade: 2, adicionaisCentavos: 300 }),
        linha({ chave: 'b', quantidade: 1, adicionaisCentavos: 0 }),
      ],
      [leve3],
      QUARTA,
    );

    // Três unidades de R$ 20: uma é brinde (R$ 20), repartida pelas linhas.
    expect(linhas.reduce((soma, item) => soma + item.descontoCentavos, 0)).toBe(2000);
    expect(linhas.map((item) => item.descontoCentavos)).toEqual([1334, 666]);
    // A primeira linha custava (20,00 + 3,00) x 2 = 46,00.
    expect(linhas.map((item) => item.totalCentavos)).toEqual([4600 - 1334, 2000 - 666]);
    expect(usadas).toEqual(['leve']);
  });

  it('tamanhos diferentes do mesmo produto são grupos diferentes', () => {
    const leve2 = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 2, pague: 1 });
    const { linhas } = aplicarPromocoes(
      [
        linha({ chave: 'p', tamanhoId: 'pequeno', baseCentavos: 1500 }),
        linha({ chave: 'g', tamanhoId: 'grande', baseCentavos: 2500 }),
      ],
      [leve2],
      QUARTA,
    );

    // Um de cada tamanho não é "leve 2": o brinde não sai do tamanho errado.
    expect(linhas.map((item) => item.descontoCentavos)).toEqual([0, 0]);
  });

  it('o desconto reparte o centavo que sobra, e a soma sempre bate', () => {
    const leve3 = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 });
    const { linhas } = aplicarPromocoes(
      [
        linha({ chave: 'a', quantidade: 1, baseCentavos: 1001 }),
        linha({ chave: 'b', quantidade: 1, baseCentavos: 1001 }),
        linha({ chave: 'c', quantidade: 1, baseCentavos: 1001 }),
      ],
      [leve3],
      QUARTA,
    );

    expect(linhas.reduce((soma, item) => soma + item.descontoCentavos, 0)).toBe(1001);
    expect(linhas.map((item) => item.descontoCentavos)).toEqual([334, 334, 333]);
  });

  it('nunca deixa uma linha negativa, nem sobe o preço', () => {
    const { linhas } = aplicarPromocoes(
      [linha({ baseCentavos: 1000 })],
      [promocao({ tipo: 'PRECO', percentual: null, precoPromocional: 50 })],
      QUARTA,
    );

    expect(linhas[0]).toMatchObject({ descontoCentavos: 0, totalCentavos: 1000, promocaoId: null });
    const total = aplicarPromocoes(
      [linha()],
      [promocao({ percentual: 100, tipo: 'SEGUNDO_COM_DESCONTO' })],
      QUARTA,
    ).linhas[0]!;
    expect(total.totalCentavos).toBeGreaterThanOrEqual(0);
  });

  it('as linhas voltam na ordem em que chegaram, com a chave delas', () => {
    const { linhas } = aplicarPromocoes(
      [linha({ chave: 'x', produtoId: 'a' }), linha({ chave: 'y', produtoId: 'b' })],
      [promocao({ produtoId: 'b' })],
      QUARTA,
    );

    expect(linhas.map((item) => item.chave)).toEqual(['x', 'y']);
    expect(linhas.map((item) => item.promocaoId)).toEqual([null, 'promo-1']);
  });
});

describe('ofertaDoProduto (a vitrine)', () => {
  const acai = { id: 'acai', categoriaId: 'doces' };

  it('"de R$ 20 por R$ 16": o desconto por unidade, o mesmo que o carrinho cobra', () => {
    const oferta = ofertaDoProduto(acai, 2000, [promocao()], QUARTA);

    expect(oferta?.rotulo).toBe('20% OFF');
    expect(oferta?.descontoPorUnidade(2000)).toBe(400);
    // O produto com tamanhos: o mesmo percentual em cada preço.
    expect(oferta?.descontoPorUnidade(3000)).toBe(600);
  });

  it('o preço promocional serve ao produto de um preço só', () => {
    const oferta = ofertaDoProduto(
      { id: 'pizza', categoriaId: 'salgados' },
      4500,
      [promocao({ produtoId: 'pizza', tipo: 'PRECO', percentual: null, precoPromocional: 39.9 })],
      QUARTA,
    );

    expect(oferta?.rotulo).toBe('Preço especial');
    expect(oferta?.descontoPorUnidade(4500)).toBe(510);
  });

  it('entre promoções de preço, a que mais baixa; a de quantidade só aparece como rótulo', () => {
    const escolhida = ofertaDoProduto(
      acai,
      2000,
      [
        promocao({ id: 'dez', percentual: 10 }),
        promocao({ id: 'vinte-e-cinco', percentual: 25 }),
        promocao({ id: 'leve', tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 }),
      ],
      QUARTA,
    );
    expect(escolhida?.promocaoId).toBe('vinte-e-cinco');

    const soDeQuantidade = ofertaDoProduto(
      acai,
      2000,
      [promocao({ id: 'leve', tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 })],
      QUARTA,
    );
    expect(soDeQuantidade?.rotulo).toBe('Leve 3, pague 2');
    // Ela não muda o preço de uma unidade: nada de "de/por" na vitrine.
    expect(soDeQuantidade?.descontoPorUnidade(2000)).toBe(0);
  });

  it('sem promoção vigente para o produto, nada aparece', () => {
    expect(ofertaDoProduto(acai, 2000, [], QUARTA)).toBeNull();
    expect(ofertaDoProduto(acai, 2000, [promocao({ produtoId: 'pizza' })], QUARTA)).toBeNull();
    expect(ofertaDoProduto(acai, 2000, [promocao({ fim: '2026-09-01' })], QUARTA)).toBeNull();
  });

  it('a promoção da seção chega aos produtos dela', () => {
    const doces = promocao({ alvo: 'CATEGORIA', produtoId: null, categoriaId: 'doces' });

    expect(ofertaDoProduto(acai, 2000, [doces], QUARTA)?.rotulo).toBe('20% OFF');
    expect(
      ofertaDoProduto({ id: 'suco', categoriaId: 'bebidas' }, 600, [doces], QUARTA),
    ).toBeNull();
  });
});
