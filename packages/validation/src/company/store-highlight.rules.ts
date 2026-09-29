import type { DestaquePublico } from '@motoboycity/types';
import { datasDoCupom } from './store-coupon.rules';

/**
 * Os destaques da loja online: um bloco com título no alto do cardápio, com os
 * produtos que a loja escolheu.
 *
 * O que a página mostra é decidido aqui, e não na tela, para o teste e a tela
 * concordarem: o destaque vale dentro das datas dele (calendário da loja), e só
 * entra nele o produto que está à venda. Um destaque sem nenhum produto à venda não
 * aparece — um bloco vazio no alto do cardápio é pior do que bloco nenhum.
 */

/** Mais que isso no alto do cardápio empurra o cardápio de verdade para baixo. */
export const MAXIMO_DE_DESTAQUES = 10;

/** Uma fileira que o cliente percorre com o dedo: passando disso, ninguém chega ao fim. */
export const MAXIMO_DE_PRODUTOS_NO_DESTAQUE = 12;

/** O destaque vale hoje? Datas no calendário da loja, as duas pontas incluídas. */
export function destaqueVigente(
  datas: { inicio: string | null; fim: string | null },
  agora: Date,
): boolean {
  return datasDoCupom(datas, agora) === 'VIGENTE';
}

export interface DestaqueNaVitrine {
  id: string;
  titulo: string;
  /** Só os que estão à venda, na ordem da loja. */
  produtoIds: string[];
}

/**
 * Os destaques que a página mostra agora, na ordem da loja.
 *
 * `agora` é `null` antes de a página conhecer a hora (a hidratação): sem a hora,
 * só valem os destaques SEM datas — mostrar um que ainda não começou, ou que já
 * acabou, e tirá-lo dois segundos depois, é pior do que esperar. `vendaveis` são os
 * ids dos produtos que a página vende (publicados e sem pendência que trave a venda).
 */
export function destaquesDaVitrine(
  destaques: readonly DestaquePublico[],
  vendaveis: ReadonlySet<string>,
  agora: Date | null,
): DestaqueNaVitrine[] {
  const resultado: DestaqueNaVitrine[] = [];
  for (const destaque of destaques) {
    const semDatas = destaque.inicio === null && destaque.fim === null;
    if (agora === null ? !semDatas : !destaqueVigente(destaque, agora)) continue;
    // Um produto repetido entra uma vez: o cartão duplicado não diz nada de novo.
    const produtoIds = [...new Set(destaque.produtoIds)].filter((id) => vendaveis.has(id));
    if (produtoIds.length === 0) continue;
    resultado.push({ id: destaque.id, titulo: destaque.titulo, produtoIds });
  }
  return resultado;
}
