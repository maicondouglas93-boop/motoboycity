import { unidadesQueCabem } from '@motoboycity/validation';
import type { ProdutoDeExemplo } from '@/lib/loja-mock';

/**
 * O estoque opcional do produto, do lado do cliente. O que a página sabe dele vem pronto do
 * servidor (`esgotado`, e `restam` quando são poucas unidades) e a regra de quantas cabem
 * é do pacote compartilhado (`unidadesQueCabem`); aqui só se olha a sacola.
 *
 * É conveniência: a página não deixa passar do que sabe, e o servidor confere de qualquer
 * jeito, no pedido — o estoque é dele.
 */

type ItemDaSacola = { produtoId: string; quantidade: number };

/** Quantas unidades deste produto já estão na sacola, somando as linhas (tamanhos diferentes). */
export function unidadesNaSacola(itens: readonly ItemDaSacola[], produtoId: string): number {
  return itens
    .filter((item) => item.produtoId === produtoId)
    .reduce((soma, item) => soma + item.quantidade, 0);
}

/**
 * Quantas unidades a mais deste produto ainda cabem na sacola. `null`: a página não sabe de
 * limite (sem controle, ou estoque alto). Produto que a página não conhece: sem limite.
 */
export function unidadesQueAindaCabem(
  produto: Pick<ProdutoDeExemplo, 'esgotado' | 'restam'> | undefined,
  itens: readonly ItemDaSacola[],
  produtoId: string,
): number | null {
  if (!produto) return null;
  return unidadesQueCabem(
    { esgotado: produto.esgotado ?? false, restam: produto.restam ?? null },
    unidadesNaSacola(itens, produtoId),
  );
}

/** "Resta 1 unidade", "Restam 3 unidades". */
export function rotuloDeRestam(restam: number): string {
  return restam === 1 ? 'Resta 1 unidade' : `Restam ${restam} unidades`;
}

/**
 * O aviso de um item da sacola que o estoque não sustenta mais: o produto esgotou depois de
 * entrar na sacola, ou a sacola tem mais do que resta. `null` quando está tudo certo.
 */
export function avisoDeEstoque(
  produto: Pick<ProdutoDeExemplo, 'nome' | 'esgotado' | 'restam'> | undefined,
  naSacola: number,
): string | null {
  if (!produto) return null;
  if (produto.esgotado) return `${produto.nome} esgotou. Tire da sacola para continuar.`;
  if (produto.restam != null && naSacola > produto.restam) {
    return `Só ${produto.restam === 1 ? 'resta 1 unidade' : `restam ${produto.restam} unidades`} de ${produto.nome}. Diminua a quantidade.`;
  }
  return null;
}
