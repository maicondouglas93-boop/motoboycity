import type { CupomPublico, PromocaoPublica } from '@motoboycity/types';
import {
  aplicarCupom,
  aplicarPromocoes,
  datasDoCupom,
  mensagemDoCupom,
  normalizarCodigoDoCupom,
  type LinhaParaPrecificar,
  type LinhaPrecificada,
} from '@motoboycity/validation';

/**
 * O cupom: a mesma conta na página e no servidor, que recusa o pedido cujo total
 * não bate com o que o cliente viu. Estes testes fixam o que o lojista promete e
 * o cliente lê: em que item o cupom age, quanto desconta e onde para.
 */

const QUARTA = new Date('2026-09-23T12:00:00-03:00');

function cupom(mudancas: Partial<CupomPublico> = {}): CupomPublico {
  return {
    codigo: 'BEMVINDO10',
    tipo: 'PERCENTUAL',
    percentual: 10,
    valor: null,
    pedidoMinimo: null,
    descontoMaximo: null,
    valeEmPromocao: false,
    produtoIds: [],
    categoriaIds: [],
    ...mudancas,
  };
}

/** Uma linha já precificada, sem promoção: `total` é o que o cliente paga por ela. */
function linha(mudancas: Partial<LinhaPrecificada> = {}): LinhaPrecificada {
  const totalCentavos = mudancas.totalCentavos ?? 2000;
  return {
    chave: '0',
    produtoId: 'acai',
    categoriaId: 'secao-acai',
    tamanhoId: null,
    quantidade: 1,
    baseCentavos: totalCentavos,
    adicionaisCentavos: 0,
    originalCentavos: totalCentavos,
    descontoCentavos: 0,
    totalCentavos,
    promocaoId: null,
    ...mudancas,
  };
}

/** A mesma linha depois de uma promoção de 20%: o cliente paga 16,00 em vez de 20,00. */
const EM_PROMOCAO = linha({
  chave: '1',
  produtoId: 'suco',
  categoriaId: 'secao-bebidas',
  originalCentavos: 2000,
  descontoCentavos: 400,
  totalCentavos: 1600,
  promocaoId: 'promo-1',
});

describe('normalizarCodigoDoCupom', () => {
  it('tira os espaços e põe em maiúsculas', () => {
    expect(normalizarCodigoDoCupom(' boas-vindas 10 ')).toBe('BOAS-VINDAS10');
    expect(normalizarCodigoDoCupom('promo_2026')).toBe('PROMO_2026');
  });
});

describe('datasDoCupom', () => {
  it('sem datas vale sempre; com elas, no calendário da loja e com as duas pontas dentro', () => {
    expect(datasDoCupom({ inicio: null, fim: null }, QUARTA)).toBe('VIGENTE');
    expect(datasDoCupom({ inicio: '2026-09-23', fim: '2026-09-23' }, QUARTA)).toBe('VIGENTE');
    expect(datasDoCupom({ inicio: '2026-09-24', fim: null }, QUARTA)).toBe('AINDA_NAO');
    expect(datasDoCupom({ inicio: null, fim: '2026-09-22' }, QUARTA)).toBe('VENCIDO');
  });

  it('meia-noite na loja é o dia da loja, e não o do relógio de Greenwich', () => {
    // 01:30 de 24/09 em Brasília é 04:30 UTC do mesmo dia; 23:30 de 23/09 já é 24/09 em UTC.
    const noiteDeQuarta = new Date('2026-09-23T23:30:00-03:00');
    expect(datasDoCupom({ inicio: null, fim: '2026-09-23' }, noiteDeQuarta)).toBe('VIGENTE');
  });
});

describe('aplicarCupom — a conta', () => {
  it('percentual sobre o que o cliente paga pelos itens', () => {
    const resultado = aplicarCupom([linha({ totalCentavos: 4500 })], cupom({ percentual: 10 }));

    expect(resultado).toEqual({ ok: true, descontoCentavos: 450, elegivelCentavos: 4500 });
  });

  it('arredonda o centavo, e não deixa o desconto passar do que os itens custam', () => {
    // 15% de 9,99 = 1,4985 → 1,50.
    expect(aplicarCupom([linha({ totalCentavos: 999 })], cupom({ percentual: 15 }))).toMatchObject({
      descontoCentavos: 150,
    });
    // 100% é tudo, e nem um centavo além.
    expect(aplicarCupom([linha({ totalCentavos: 999 })], cupom({ percentual: 100 }))).toMatchObject(
      {
        descontoCentavos: 999,
      },
    );
  });

  it('o teto do desconto vale só para o cupom em %', () => {
    const grande = [linha({ totalCentavos: 20000 })];

    // 10% de 200,00 = 20,00, mas o teto é 15,00.
    expect(aplicarCupom(grande, cupom({ percentual: 10, descontoMaximo: 15 }))).toMatchObject({
      descontoCentavos: 1500,
    });
    // Abaixo do teto, o teto não muda nada.
    expect(aplicarCupom(grande, cupom({ percentual: 5, descontoMaximo: 15 }))).toMatchObject({
      descontoCentavos: 1000,
    });
  });

  it('valor fixo: o valor do cupom, ou tudo o que os itens custam, se custarem menos', () => {
    const fixo = cupom({ tipo: 'VALOR', percentual: null, valor: 5 });

    expect(aplicarCupom([linha({ totalCentavos: 4500 })], fixo)).toMatchObject({
      descontoCentavos: 500,
    });
    expect(aplicarCupom([linha({ totalCentavos: 300 })], fixo)).toMatchObject({
      descontoCentavos: 300,
    });
  });

  it('o desconto sai só dos itens que o cupom alcança', () => {
    const duas = [
      linha({ chave: '0', produtoId: 'acai', totalCentavos: 3000 }),
      linha({ chave: '1', produtoId: 'suco', categoriaId: 'secao-bebidas', totalCentavos: 1000 }),
    ];

    const soAcai = aplicarCupom(duas, cupom({ percentual: 10, produtoIds: ['acai'] }));
    const soBebidas = aplicarCupom(
      duas,
      cupom({ percentual: 10, categoriaIds: ['secao-bebidas'] }),
    );
    const osDois = aplicarCupom(
      duas,
      cupom({ percentual: 10, produtoIds: ['acai'], categoriaIds: ['secao-bebidas'] }),
    );

    expect(soAcai).toMatchObject({ descontoCentavos: 300, elegivelCentavos: 3000 });
    expect(soBebidas).toMatchObject({ descontoCentavos: 100, elegivelCentavos: 1000 });
    // Produto OU seção: os dois listados, os dois entram.
    expect(osDois).toMatchObject({ descontoCentavos: 400, elegivelCentavos: 4000 });
  });
});

describe('aplicarCupom — promoção e cupom não se somam', () => {
  it('o item em promoção fica de fora: o cupom age só no que está a preço cheio', () => {
    const sacola = [linha({ chave: '0', totalCentavos: 2000 }), EM_PROMOCAO];

    const resultado = aplicarCupom(sacola, cupom({ percentual: 10 }));

    // 10% de 20,00 (o açaí), e não de 36,00.
    expect(resultado).toEqual({ ok: true, descontoCentavos: 200, elegivelCentavos: 2000 });
  });

  it('com "vale em promoção", o cupom desconta também o que já está em promoção', () => {
    const sacola = [linha({ chave: '0', totalCentavos: 2000 }), EM_PROMOCAO];

    const resultado = aplicarCupom(sacola, cupom({ percentual: 10, valeEmPromocao: true }));

    // 10% de 36,00, sobre o que o cliente paga (16,00 no suco), e não sobre o preço cheio.
    expect(resultado).toEqual({ ok: true, descontoCentavos: 360, elegivelCentavos: 3600 });
  });

  it('só há item em promoção: o cupom diz que não vale junto', () => {
    const resultado = aplicarCupom([EM_PROMOCAO], cupom());

    expect(resultado).toEqual({ ok: false, motivo: 'SEM_ITEM_ELEGIVEL', porPromocao: true });
    expect(mensagemDoCupom(resultado as never)).toBe(
      'Os itens da sua sacola já estão em promoção, e este cupom não vale junto.',
    );
  });

  it('nada da sacola está no alcance do cupom: diz isso, sem falar de promoção', () => {
    const resultado = aplicarCupom(
      [linha({ produtoId: 'acai' })],
      cupom({ produtoIds: ['outro-produto'] }),
    );

    expect(resultado).toEqual({ ok: false, motivo: 'SEM_ITEM_ELEGIVEL', porPromocao: false });
    expect(mensagemDoCupom(resultado as never)).toBe(
      'Este cupom não vale para os itens da sua sacola.',
    );
  });

  it('funciona com o que aplicarPromocoes devolve: o item que ganhou promoção fica de fora', () => {
    const promocao: PromocaoPublica = {
      id: 'promo-acai',
      nome: 'Açaí 20%',
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
    };
    const linhas: LinhaParaPrecificar[] = [
      {
        chave: '0',
        produtoId: 'acai',
        categoriaId: 'secao-acai',
        tamanhoId: null,
        quantidade: 1,
        baseCentavos: 2000,
        adicionaisCentavos: 0,
      },
      {
        chave: '1',
        produtoId: 'suco',
        categoriaId: 'secao-bebidas',
        tamanhoId: null,
        quantidade: 1,
        baseCentavos: 1000,
        adicionaisCentavos: 0,
      },
    ];
    const { linhas: precificadas } = aplicarPromocoes(linhas, [promocao], QUARTA);

    // O açaí custa 16,00 com a promoção; o cupom só age nos 10,00 do suco.
    expect(aplicarCupom(precificadas, cupom({ percentual: 10 }))).toEqual({
      ok: true,
      descontoCentavos: 100,
      elegivelCentavos: 1000,
    });
  });
});

describe('aplicarCupom — pedido mínimo', () => {
  it('conta a sacola inteira, já com as promoções, e não só os itens do cupom', () => {
    const sacola = [linha({ chave: '0', totalCentavos: 2000 }), EM_PROMOCAO];

    // 20,00 + 16,00 = 36,00 na sacola; o mínimo de 35,00 passa, ainda que o cupom só alcance 20,00.
    expect(aplicarCupom(sacola, cupom({ pedidoMinimo: 35 }))).toMatchObject({ ok: true });
    expect(aplicarCupom(sacola, cupom({ pedidoMinimo: 40 }))).toEqual({
      ok: false,
      motivo: 'ABAIXO_DO_MINIMO',
      minimoCentavos: 4000,
      faltamCentavos: 400,
    });
  });

  it('diz quanto falta, em reais', () => {
    const resultado = aplicarCupom([linha({ totalCentavos: 2550 })], cupom({ pedidoMinimo: 30 }));

    expect(mensagemDoCupom(resultado as never)).toBe(
      'Faltam R$ 4,50 em itens para usar este cupom (pedido mínimo de R$ 30,00).',
    );
  });

  it('o mínimo exato passa', () => {
    expect(
      aplicarCupom([linha({ totalCentavos: 3000 })], cupom({ pedidoMinimo: 30 })),
    ).toMatchObject({ ok: true });
  });
});
