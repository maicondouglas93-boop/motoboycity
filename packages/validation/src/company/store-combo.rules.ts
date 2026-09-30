import { emCentavos, emReais } from './store-pricing.rules';
import { estoqueNaVitrine, type EstoqueNaVitrine } from './store-stock.rules';

/**
 * O combo da loja online: vários produtos da loja por um preço só, como "X-Burger + batata +
 * refri". As contas que o servidor e a tela precisam fazer igual moram aqui.
 *
 * O combo não tem estoque próprio: ele tem o dos produtos que leva. Cada pedido de combo baixa
 * as unidades de cada item (a quantidade do item vezes a de combos pedidos), e o combo "esgota"
 * quando algum item com estoque controlado não tem mais o que ele leva.
 */

export const LIMITES_DO_COMBO = {
  /** Produtos diferentes que um combo leva. */
  itens: 12,
  /** Unidades de um mesmo item dentro do combo. */
  quantidade: 20,
} as const;

/** Um item do combo: o produto, o tamanho fixo (se o produto tem tamanhos) e quantas unidades. */
export interface ItemDoCombo {
  productId: string;
  sizeId: string | null;
  quantity: number;
}

/** O que o combo precisa saber de um produto que leva. */
export interface ProdutoDoCombo {
  price: number | null;
  sizes: ReadonlyArray<{ id: string; price: number }>;
}

/**
 * O preço de UMA unidade do item, como o cardápio o mostra hoje: o do tamanho fixo, ou o único.
 * `null` quando não dá para saber (o produto sumiu, o tamanho foi removido).
 */
export function precoDoItemDoCombo(
  item: ItemDoCombo,
  produto: ProdutoDoCombo | undefined,
): number | null {
  if (!produto) return null;
  if (item.sizeId !== null) {
    return produto.sizes.find((tamanho) => tamanho.id === item.sizeId)?.price ?? null;
  }
  return produto.price;
}

/**
 * O que os itens custariam comprados separados, em reais — sem promoção, no preço de hoje.
 * `null` se algum item não se resolve: sem saber o preço de todos, não se fala em economia.
 */
export function valorSeparadoDoCombo(
  itens: readonly ItemDoCombo[],
  produtoPorId: (id: string) => ProdutoDoCombo | undefined,
): number | null {
  let total = 0;
  for (const item of itens) {
    const preco = precoDoItemDoCombo(item, produtoPorId(item.productId));
    if (preco === null) return null;
    total += emCentavos(preco) * item.quantity;
  }
  return emReais(total);
}

/** Quanto o cliente economiza no combo em relação aos itens separados. Nunca negativo. */
export function economiaDoCombo(precoDoCombo: number, valorSeparado: number | null): number {
  if (valorSeparado === null) return 0;
  return Math.max(0, emReais(emCentavos(valorSeparado) - emCentavos(precoDoCombo)));
}

/**
 * Quantos combos dá para montar com o estoque de agora: o item que mais limita manda. `null`
 * quando nenhum item tem estoque controlado (o combo vende sem limite).
 */
export function capacidadeDoCombo(
  itens: ReadonlyArray<{ stock: number | null; quantity: number }>,
): number | null {
  let capacidade: number | null = null;
  for (const item of itens) {
    if (item.stock === null) continue;
    const cabem = Math.floor(Math.max(item.stock, 0) / item.quantity);
    capacidade = capacidade === null ? cabem : Math.min(capacidade, cabem);
  }
  return capacidade;
}

/** O que o cliente pode saber do estoque do combo: a mesma regra do produto, sobre a capacidade. */
export function estoqueDoCombo(
  itens: ReadonlyArray<{ stock: number | null; quantity: number }>,
): EstoqueNaVitrine {
  return estoqueNaVitrine(capacidadeDoCombo(itens));
}
