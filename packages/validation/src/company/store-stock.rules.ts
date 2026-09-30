/**
 * O estoque opcional do produto da loja online.
 *
 * Sem número (`null`), o produto não tem controle e vende sem limite, como sempre. Com
 * número, cada pedido baixa a quantidade pedida, o pedido cancelado devolve, e em zero o
 * produto fica "esgotado" — sem mudar o `status`, que é escolha da loja: repôs o estoque, o
 * produto volta sozinho.
 *
 * O que a página sabe do estoque está aqui, para o servidor e a tela concordarem: o número
 * exato é da loja e não vai para o cliente; ele recebe só se esgotou e, quando são poucas
 * unidades, quantas restam.
 */

/** Até quantas unidades a página avisa "restam N". Acima disso, "tem bastante" e nada se diz. */
export const LIMITE_DO_AVISO_DE_ESTOQUE = 5;

export interface EstoqueNaVitrine {
  esgotado: boolean;
  /** Restam poucas: quantas. `null`: sem controle, ou ainda há bastante. */
  restam: number | null;
}

/** O que o cliente pode saber do estoque de um produto. */
export function estoqueNaVitrine(estoque: number | null): EstoqueNaVitrine {
  if (estoque === null) return { esgotado: false, restam: null };
  if (estoque <= 0) return { esgotado: true, restam: null };
  return { esgotado: false, restam: estoque <= LIMITE_DO_AVISO_DE_ESTOQUE ? estoque : null };
}

/**
 * Quantas unidades ainda cabem na sacola de um produto, pelo que a página sabe.
 *
 * `null`: a página não sabe de limite (sem controle, ou estoque alto) — e o servidor confere
 * de qualquer jeito, no pedido. Com poucas unidades (`restam`), é o que sobra depois do que
 * já está na sacola; nunca negativo. Esgotado, zero.
 */
export function unidadesQueCabem(
  produto: { esgotado: boolean; restam: number | null },
  jaNaSacola: number,
): number | null {
  if (produto.esgotado) return 0;
  if (produto.restam === null) return null;
  return Math.max(produto.restam - jaNaSacola, 0);
}
