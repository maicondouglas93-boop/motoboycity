import type { CupomPublico, PromocaoPublica } from '@motoboycity/types';
import {
  aplicarCupom,
  aplicarPromocoes,
  emCentavos,
  emReais,
  mensagemDoCupom,
  ofertaDoProduto,
  rotuloDaPromocao,
  type LinhaParaPrecificar,
  type LinhaPrecificada,
} from '@motoboycity/validation';
import type { ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import type { ProdutoDeExemplo } from '@/lib/loja-mock';

/**
 * O que a página mostra de promoção, pelas MESMAS regras que o servidor usa no
 * pedido (`packages/validation`). Aqui só se traduz o que a página tem — itens
 * da sacola, produtos do cardápio — para o que a regra pede; nenhuma conta de
 * desconto é feita neste arquivo. O servidor recalcula e recusa o pedido se o
 * total que a página viu não bater.
 *
 * Antes da hidratação `agora` é `null`: o servidor não sabe a hora de quem
 * abriu a página, e mostrar uma oferta que depende de horário sem saber a hora
 * é prometer um preço que o pedido pode não cobrar. Sem hora, preço cheio.
 */

/** O preço do produto, sem adicionais: o do tamanho, ou o único. */
export function precoBaseDoItem(
  produto: ProdutoDeExemplo | undefined,
  tamanhoId: string | null | undefined,
): number | null {
  if (!produto) return null;
  if (tamanhoId) return produto.tamanhos.find((tamanho) => tamanho.id === tamanhoId)?.preco ?? null;
  return produto.precoUnico;
}

export interface LinhaDaSacola {
  /** O que a linha custa sem promoção. */
  original: number;
  /** O que o cliente paga. */
  total: number;
  promocao: { id: string; rotulo: string; desconto: number } | null;
}

export interface SacolaPrecificada {
  linhas: LinhaDaSacola[];
  /** A soma do que o cliente paga pelos itens, já com as promoções. */
  subtotal: number;
  /** Quanto as promoções tiraram do que custaria. */
  economia: number;
  /** As linhas como a regra as devolveu: é sobre elas que o cupom desconta. */
  regra: LinhaPrecificada[];
}

/** A sacola com as promoções aplicadas; uma linha para cada item, na ordem dele. */
export function precificarSacola(
  itens: ItemEscolhido[],
  produtos: ProdutoDeExemplo[],
  promocoes: PromocaoPublica[],
  agora: number | null,
): SacolaPrecificada {
  const linhasDaRegra: LinhaParaPrecificar[] = itens.map((item, indice) => {
    const produto = produtos.find((candidato) => candidato.id === item.produtoId);
    const unitario = emCentavos(item.unitario);
    // Sacola salva antes de o produto mudar (ou de o preço vir por id) cai no
    // preço que o item guardou: sem base conhecida, os adicionais valem zero.
    const conhecida = precoBaseDoItem(produto, item.tamanhoId);
    const base = conhecida === null ? unitario : Math.min(emCentavos(conhecida), unitario);
    return {
      chave: String(indice),
      produtoId: item.produtoId,
      categoriaId: produto?.categoriaId ?? null,
      tamanhoId: item.tamanhoId ?? null,
      quantidade: item.quantidade,
      baseCentavos: base,
      adicionaisCentavos: unitario - base,
      // O preço do combo já é o especial: promoção nenhuma age sobre ele (nem o cupom acumula).
      combo: Boolean(produto?.combo),
    };
  });

  // Sem hora conhecida não há promoção: a mesma regra, com a lista vazia, dá o preço cheio.
  const resultado = aplicarPromocoes(
    linhasDaRegra,
    agora === null ? [] : promocoes,
    new Date(agora ?? 0),
  );

  const linhas = itens.map((item, indice): LinhaDaSacola => {
    const feita = resultado.linhas[indice];
    if (!feita) {
      const cheio = emCentavos(item.unitario) * item.quantidade;
      return { original: emReais(cheio), total: emReais(cheio), promocao: null };
    }
    const promocao = feita.promocaoId
      ? promocoes.find((candidata) => candidata.id === feita.promocaoId)
      : undefined;
    return {
      original: emReais(feita.originalCentavos),
      total: emReais(feita.totalCentavos),
      promocao:
        promocao && feita.descontoCentavos > 0
          ? {
              id: promocao.id,
              rotulo: rotuloDaPromocao(promocao),
              desconto: emReais(feita.descontoCentavos),
            }
          : null,
    };
  });

  const totalEmCentavos = linhas.reduce((soma, linha) => soma + emCentavos(linha.total), 0);
  const originalEmCentavos = linhas.reduce((soma, linha) => soma + emCentavos(linha.original), 0);
  return {
    linhas,
    subtotal: emReais(totalEmCentavos),
    economia: emReais(originalEmCentavos - totalEmCentavos),
    regra: resultado.linhas,
  };
}

export interface CupomNaSacola {
  /** Quanto o cupom tira do total desta sacola; zero se não vale. */
  desconto: number;
  /** Por que ele não vale para esta sacola agora (o mínimo, por exemplo), ou `null`. */
  recusa: string | null;
}

/**
 * O desconto do cupom que o cliente aplicou, sobre a sacola de agora, pela mesma
 * regra do servidor (`aplicarCupom`). Recalcula a cada mudança da sacola: o cupom
 * que deixou de valer (tirou-se um item, o pedido caiu abaixo do mínimo) não
 * some — a página diz por quê, e o desconto volta quando a sacola voltar a servir.
 */
export function cupomNaSacola(
  sacola: SacolaPrecificada,
  cupom: CupomPublico | null,
): CupomNaSacola {
  if (!cupom) return { desconto: 0, recusa: null };
  const resultado = aplicarCupom(sacola.regra, cupom);
  if (!resultado.ok) return { desconto: 0, recusa: mensagemDoCupom(resultado) };
  return { desconto: emReais(resultado.descontoCentavos), recusa: null };
}

export interface OfertaNaVitrine {
  rotulo: string;
  /** O preço de hoje, riscado ("De"). `null` nas promoções de quantidade. */
  de: number | null;
  /** O preço com a promoção ("Por"). `null` nas promoções de quantidade. */
  por: number | null;
}

/** O que a vitrine precisa do produto: o painel também a usa, na prévia da promoção. */
export type ProdutoNaVitrine = Pick<ProdutoDeExemplo, 'id' | 'categoriaId' | 'precoUnico'> & {
  tamanhos: Array<{ preco: number }>;
  /** O combo não tem oferta: o preço dele já é o especial. */
  combo?: unknown;
};

/** O "De / Por" de um produto na lista do cardápio; `null` quando não há oferta. */
export function ofertaNaVitrine(
  produto: ProdutoNaVitrine,
  promocoes: PromocaoPublica[],
  agora: number | null,
): OfertaNaVitrine | null {
  if (agora === null || promocoes.length === 0 || produto.combo) return null;
  const menorPreco =
    produto.tamanhos.length > 0
      ? Math.min(...produto.tamanhos.map((tamanho) => tamanho.preco))
      : (produto.precoUnico ?? 0);
  const base = emCentavos(menorPreco);
  const oferta = ofertaDoProduto(
    { id: produto.id, categoriaId: produto.categoriaId },
    base,
    promocoes,
    new Date(agora),
  );
  if (!oferta) return null;
  const desconto = oferta.descontoPorUnidade(base);
  if (desconto <= 0) return { rotulo: oferta.rotulo, de: null, por: null };
  return { rotulo: oferta.rotulo, de: emReais(base), por: emReais(base - desconto) };
}
