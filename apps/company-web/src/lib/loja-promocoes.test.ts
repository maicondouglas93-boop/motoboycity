import { describe, expect, it } from 'vitest';
import type { CupomPublico, PromocaoPublica } from '@motoboycity/types';
import type { ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import type { ProdutoDeExemplo } from '@/lib/loja-mock';
import { cupomNaSacola, ofertaNaVitrine, precificarSacola } from './loja-promocoes';

/**
 * A página traduz sacola e cardápio para a regra que o servidor usa; a conta em
 * si é da regra (testada em `packages/validation`). Aqui se confere a tradução:
 * o que é preço do produto, o que é adicional, e o que a página mostra.
 */

const AGORA = new Date('2026-10-10T15:00:00Z').getTime();

const ACAI: ProdutoDeExemplo = {
  id: 'p1',
  nome: 'Açaí',
  descricao: '',
  categoriaId: 'c1',
  imagemUrl: null,
  precoUnico: null,
  situacao: 'publicado',
  tamanhos: [
    { id: 't1', nome: '300ml', preco: 12, disponivel: true },
    { id: 't2', nome: '500ml', preco: 18, disponivel: true },
  ],
  grupos: [],
};

const SUCO: ProdutoDeExemplo = {
  ...ACAI,
  id: 'p2',
  nome: 'Suco',
  categoriaId: 'c2',
  precoUnico: 10,
  tamanhos: [],
};

function promocao(mudancas: Partial<PromocaoPublica> = {}): PromocaoPublica {
  return {
    id: 'promo-1',
    nome: 'Açaí 20%',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: 'p1',
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

/** Açaí 500ml com 3,10 de adicionais: 21,10 a unidade. */
function acai(quantidade: number, mudancas: Partial<ItemEscolhido> = {}): ItemEscolhido {
  return {
    produtoId: 'p1',
    nome: 'Açaí',
    tamanho: '500ml',
    escolhas: ['Morango', 'Chocolate'],
    tamanhoId: 't2',
    escolhaIds: ['e1', 'e2'],
    quantidade,
    unitario: 21.1,
    ...mudancas,
  };
}

describe('precificarSacola', () => {
  it('sem promoção o item custa o que sempre custou', () => {
    const { linhas, subtotal, economia } = precificarSacola([acai(2)], [ACAI], [], AGORA);

    expect(linhas).toEqual([{ original: 42.2, total: 42.2, promocao: null }]);
    expect(subtotal).toBe(42.2);
    expect(economia).toBe(0);
  });

  it('o desconto age no preço do produto, e os adicionais ficam cheios', () => {
    const { linhas, subtotal, economia } = precificarSacola([acai(2)], [ACAI], [promocao()], AGORA);

    // 2 × (18,00 − 20%) + 2 × 3,10 = 28,80 + 6,20.
    expect(subtotal).toBe(35);
    expect(economia).toBe(7.2);
    expect(linhas[0]).toEqual({
      original: 42.2,
      total: 35,
      promocao: { id: 'promo-1', rotulo: '20% OFF', desconto: 7.2 },
    });
  });

  it('antes de a página saber a hora, ela mostra o preço cheio', () => {
    const { subtotal } = precificarSacola([acai(2)], [ACAI], [promocao()], null);

    expect(subtotal).toBe(42.2);
  });

  it('a promoção fora da janela não vale', () => {
    const vencida = promocao({ fim: '2026-10-01' });

    expect(precificarSacola([acai(1)], [ACAI], [vencida], AGORA).economia).toBe(0);
  });

  it('leve 3, pague 2 conta as unidades de linhas diferentes do mesmo produto e tamanho', () => {
    const leve = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 });
    const linhas = [acai(2), acai(1, { escolhas: ['Banana'], escolhaIds: ['e3'], unitario: 19.5 })];

    const resultado = precificarSacola(linhas, [ACAI], [leve], AGORA);

    // A unidade grátis é de R$ 18,00 (o produto), e sai de uma das linhas.
    expect(resultado.economia).toBe(18);
    expect(resultado.subtotal).toBe(42.2 + 19.5 - 18);
  });

  it('o produto que não está mais no cardápio fica sem promoção, pelo preço que o item guardou', () => {
    const sumiu = acai(1, { produtoId: 'antigo', tamanhoId: null, unitario: 25 });

    const { subtotal, linhas } = precificarSacola(
      [sumiu],
      [ACAI],
      [promocao({ produtoId: 'antigo' })],
      AGORA,
    );

    // Sem base conhecida, o desconto de 20% incide sobre os 25 do item (não há adicional).
    expect(linhas[0]?.original).toBe(25);
    expect(subtotal).toBe(20);
  });

  it('promoção da seção vale para todo produto dela', () => {
    const secao = promocao({ alvo: 'CATEGORIA', produtoId: null, categoriaId: 'c2' });
    const suco: ItemEscolhido = {
      produtoId: 'p2',
      nome: 'Suco',
      tamanho: null,
      escolhas: [],
      quantidade: 1,
      unitario: 10,
    };

    expect(precificarSacola([suco], [ACAI, SUCO], [secao], AGORA).subtotal).toBe(8);
    expect(precificarSacola([acai(1)], [ACAI, SUCO], [secao], AGORA).economia).toBe(0);
  });
});

describe('ofertaNaVitrine', () => {
  it('mostra o "De / Por" do menor preço do produto', () => {
    expect(ofertaNaVitrine(ACAI, [promocao()], AGORA)).toEqual({
      rotulo: '20% OFF',
      de: 12,
      por: 9.6,
    });
  });

  it('no produto de preço único também', () => {
    const precoEspecial = promocao({
      produtoId: 'p2',
      tipo: 'PRECO',
      percentual: null,
      precoPromocional: 7.5,
    });

    expect(ofertaNaVitrine(SUCO, [precoEspecial], AGORA)).toEqual({
      rotulo: 'Preço especial',
      de: 10,
      por: 7.5,
    });
  });

  it('a promoção de quantidade mostra só o rótulo, sem preço riscado', () => {
    const leve = promocao({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2 });

    expect(ofertaNaVitrine(ACAI, [leve], AGORA)).toEqual({
      rotulo: 'Leve 3, pague 2',
      de: null,
      por: null,
    });
  });

  it('sem promoção que sirva, ou sem saber a hora, não há oferta', () => {
    expect(ofertaNaVitrine(SUCO, [promocao()], AGORA)).toBeNull();
    expect(ofertaNaVitrine(ACAI, [promocao()], null)).toBeNull();
    expect(ofertaNaVitrine(ACAI, [], AGORA)).toBeNull();
  });
});

describe('cupomNaSacola', () => {
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
  const semPromocao = () => precificarSacola([acai(2)], [ACAI], [], AGORA);
  const comPromocao = () => precificarSacola([acai(2)], [ACAI], [promocao()], AGORA);

  it('sem cupom, não desconta nada', () => {
    expect(cupomNaSacola(semPromocao(), null)).toEqual({ desconto: 0, recusa: null });
  });

  it('desconta o percentual dos itens, pelo que o cliente paga', () => {
    // 2 x 21,10 = 42,20; 10% = 4,22.
    expect(cupomNaSacola(semPromocao(), cupom())).toEqual({ desconto: 4.22, recusa: null });
  });

  it('o item em promoção fica fora do cupom, e a página diz por quê', () => {
    expect(cupomNaSacola(comPromocao(), cupom())).toEqual({
      desconto: 0,
      recusa: 'Os itens da sua sacola já estão em promoção, e este cupom não vale junto.',
    });
  });

  it('com "vale em promoção", desconta sobre o que o cliente já paga', () => {
    // Com a promoção de 20% o açaí custa 35,00 (2 x 14,40 + 2 x 3,10); 10% = 3,50.
    expect(cupomNaSacola(comPromocao(), cupom({ valeEmPromocao: true }))).toEqual({
      desconto: 3.5,
      recusa: null,
    });
  });

  it('o pedido mínimo do cupom conta a sacola, e a frase diz quanto falta', () => {
    expect(cupomNaSacola(semPromocao(), cupom({ pedidoMinimo: 50 }))).toEqual({
      desconto: 0,
      recusa: 'Faltam R$ 7,80 em itens para usar este cupom (pedido mínimo de R$ 50,00).',
    });
  });

  it('o cupom de valor fixo nunca passa do que os itens custam', () => {
    const fixo = cupom({ tipo: 'VALOR', percentual: null, valor: 100 });

    expect(cupomNaSacola(semPromocao(), fixo).desconto).toBe(42.2);
  });

  it('antes de a página saber a hora, o cupom age sobre o preço cheio', () => {
    const semHora = precificarSacola([acai(2)], [ACAI], [promocao()], null);

    expect(cupomNaSacola(semHora, cupom()).desconto).toBe(4.22);
  });
});

describe('o combo na sacola e na vitrine', () => {
  const COMBO: ProdutoDeExemplo = {
    ...SUCO,
    id: 'cb1',
    nome: 'Combo Açaí + Suco',
    categoriaId: 'c1',
    precoUnico: 30,
    combo: {
      itens: [
        { produtoId: 'p1', nome: 'Açaí', tamanho: '500ml', quantidade: 1 },
        { produtoId: 'p2', nome: 'Suco', tamanho: null, quantidade: 1 },
      ],
      valorSeparado: 28,
    },
  };
  const combo = (quantidade: number): ItemEscolhido => ({
    produtoId: 'cb1',
    nome: 'Combo Açaí + Suco',
    tamanho: null,
    escolhas: [],
    quantidade,
    unitario: 30,
  });
  const deSecao = promocao({
    alvo: 'CATEGORIA',
    produtoId: null,
    categoriaId: 'c1',
    percentual: 50,
  });

  it('a promoção da seção baixa o açaí e deixa o combo da mesma seção pelo preço dele', () => {
    const sacola = precificarSacola([acai(1), combo(1)], [ACAI, COMBO], [deSecao], AGORA);

    // O açaí (18 + 3,10) cai pela metade só no preço do produto; o combo fica em 30,00.
    expect(sacola.linhas[0]?.promocao).not.toBeNull();
    expect(sacola.linhas[1]).toEqual({ original: 30, total: 30, promocao: null });
    expect(sacola.subtotal).toBe(12.1 + 30);
  });

  it('o cupom comum não desconta o combo, mas desconta o produto avulso', () => {
    const cupom: CupomPublico = {
      codigo: 'BEMVINDO10',
      tipo: 'PERCENTUAL',
      percentual: 10,
      valor: null,
      pedidoMinimo: null,
      descontoMaximo: null,
      valeEmPromocao: false,
      produtoIds: [],
      categoriaIds: [],
    };

    const soCombo = cupomNaSacola(precificarSacola([combo(1)], [COMBO], [], AGORA), cupom);
    expect(soCombo.desconto).toBe(0);
    expect(soCombo.recusa).toContain('já estão em promoção');

    const comSuco = cupomNaSacola(
      precificarSacola(
        [
          combo(1),
          {
            ...acai(1),
            produtoId: 'p2',
            nome: 'Suco',
            tamanho: null,
            tamanhoId: null,
            escolhas: [],
            unitario: 10,
          },
        ],
        [COMBO, SUCO],
        [],
        AGORA,
      ),
      cupom,
    );
    // 10% só do suco (10,00): o combo de 30,00 fica de fora.
    expect(comSuco.desconto).toBe(1);
  });

  it('o combo não tem "De / Por" na vitrine, ainda que a seção dele esteja em promoção', () => {
    expect(ofertaNaVitrine(ACAI, [deSecao], AGORA)).not.toBeNull();
    expect(ofertaNaVitrine(COMBO, [deSecao], AGORA)).toBeNull();
  });
});
