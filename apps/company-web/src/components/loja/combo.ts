import type { StoreProduct } from '@motoboycity/types';
import { capacidadeDoCombo } from '@motoboycity/validation';

/**
 * O combo, do lado do painel: o que o formulário e a lista precisam saber sobre ele, lido do
 * catálogo que a tela já tem. As regras de o que pode entrar num combo e de quando ele fica fora do
 * ar são as do servidor (`storeProductIssues`, em `@motoboycity/validation`); aqui só se organiza
 * o que mostrar.
 */

export function produtoPorId(produtos: readonly StoreProduct[]): Map<string, StoreProduct> {
  return new Map(produtos.map((produto) => [produto.id, produto]));
}

/**
 * Por que o produto NÃO pode entrar num combo, ou `null` se pode. Combo dentro de combo não
 * existe; e o produto que exige escolhas do cliente (o ponto da carne, a fruta do açaí) não tem
 * como ser fixado — o cliente escolheria por cima do combo, e o preço do combo não sabe disso.
 */
export function motivoDeNaoEntrarNoCombo(produto: StoreProduct): string | null {
  if (produto.kind === 'COMBO') return 'é um combo';
  if (produto.optionGroups.some((grupo) => grupo.minChoices >= 1)) return 'exige escolhas';
  return null;
}

/** "1× X-Burger, 2× Batata (Média), 1× Refrigerante" — o que o combo leva, em uma linha. */
export function resumoDoCombo(
  combo: StoreProduct,
  porId: ReadonlyMap<string, StoreProduct>,
): string {
  return combo.comboItems
    .map((item) => {
      const produto = porId.get(item.productId);
      if (!produto) return `${item.quantity}× (removido)`;
      const tamanho = produto.sizes.find((candidato) => candidato.id === item.sizeId);
      return `${item.quantity}× ${produto.name}${tamanho ? ` (${tamanho.name})` : ''}`;
    })
    .join(', ');
}

/**
 * O estoque que a lista mostra: o do produto ou, no combo, quantos combos dá para montar com o que
 * os produtos dele têm agora. `null`: nada é controlado.
 */
export function estoqueNaLista(
  produto: StoreProduct,
  porId: ReadonlyMap<string, StoreProduct>,
): number | null {
  if (produto.kind !== 'COMBO') return produto.stock;
  return capacidadeDoCombo(
    produto.comboItems.map((item) => ({
      stock: porId.get(item.productId)?.stock ?? null,
      quantity: item.quantity,
    })),
  );
}

/** Os combos que levam este produto: apagá-lo ou pausá-lo os tira do ar. */
export function combosQueLevam(
  produtoId: string,
  produtos: readonly StoreProduct[],
): StoreProduct[] {
  return produtos.filter(
    (produto) =>
      produto.kind === 'COMBO' && produto.comboItems.some((item) => item.productId === produtoId),
  );
}
