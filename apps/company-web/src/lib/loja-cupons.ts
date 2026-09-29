import type { CupomPublico } from '@motoboycity/types';

/**
 * Os textos do cupom, em português, para o painel e para o checkout do cliente. Só
 * texto: a conta do desconto é da regra compartilhada (`packages/validation`).
 */

function emReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `AAAA-MM-DD` na língua de quem lê. */
export function dataDoCupom(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** O que o cupom faz, numa frase: "10% de desconto (até R$ 15,00)", "R$ 5,00 de desconto". */
export function descricaoDoCupom(
  cupom: Pick<CupomPublico, 'tipo' | 'percentual' | 'valor' | 'descontoMaximo'>,
): string {
  if (cupom.tipo === 'VALOR') return `${emReais(cupom.valor ?? 0)} de desconto`;
  const base = `${cupom.percentual ?? 0}% de desconto`;
  return cupom.descontoMaximo !== null ? `${base} (até ${emReais(cupom.descontoMaximo)})` : base;
}

/**
 * As condições do cupom, na letra miúda do cartão do checkout: mínimo, onde vale, se vale
 * em item em promoção e até quando. Só o que o cupom tem.
 */
export function condicoesDoCupom(cupom: CupomPublico & { fim: string | null }): string[] {
  const partes: string[] = [];
  if (cupom.pedidoMinimo !== null) partes.push(`Pedido mínimo de ${emReais(cupom.pedidoMinimo)}`);
  if (cupom.produtoIds.length + cupom.categoriaIds.length > 0) {
    partes.push('Vale só em alguns produtos');
  }
  partes.push(
    cupom.valeEmPromocao ? 'Vale também em itens em promoção' : 'Não vale em itens em promoção',
  );
  if (cupom.fim !== null) partes.push(`Válido até ${dataDoCupom(cupom.fim)}`);
  return partes;
}
