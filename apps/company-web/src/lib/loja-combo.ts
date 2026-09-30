import { economiaDoCombo } from '@motoboycity/validation';
import type { ProdutoDeExemplo } from '@/lib/loja-mock';
import { moeda } from '@/components/loja-online/paleta';

/**
 * O combo, do lado da loja do cliente: o texto do que ele leva e a economia contra os itens
 * comprados separados. A conta é a de `@motoboycity/validation` (`economiaDoCombo`); aqui só se
 * traduz o que a página tem.
 */

export interface ItemDoComboParaTexto {
  nome: string;
  tamanho: string | null;
  quantidade: number;
}

/** "1× X-Burger, 2× Batata (Média), 1× Refrigerante" — o que o combo leva, em uma linha. */
export function descricaoDoCombo(itens: readonly ItemDoComboParaTexto[]): string {
  return itens
    .map((item) => `${item.quantidade}× ${item.nome}${item.tamanho ? ` (${item.tamanho})` : ''}`)
    .join(', ');
}

/** Quanto o cliente economiza no combo, em reais; zero se não sobra economia ou não é combo. */
export function economiaDoComboNaPagina(
  produto: Pick<ProdutoDeExemplo, 'precoUnico' | 'combo'>,
): number {
  if (!produto.combo || produto.precoUnico === null) return 0;
  return economiaDoCombo(produto.precoUnico, produto.combo.valorSeparado);
}

/** "Economize R$ 6,10". */
export function rotuloDeEconomia(economia: number): string {
  return `Economize ${moeda(economia)}`;
}
