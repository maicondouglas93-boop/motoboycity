import type { CupomPublico } from '@motoboycity/types';
import { emCentavos, type LinhaPrecificada } from './store-pricing.rules';
import { momentoNaLoja } from './store-schedule.rules';

/**
 * O cupom de desconto da loja online: regras puras, em centavos inteiros.
 *
 * Moram neste pacote, como as promoções, porque o servidor recusa o pedido cujo
 * total não bate com o que o cliente viu — e as duas pontas só batem se fizerem a
 * MESMA conta. O cupom entra DEPOIS das promoções: recebe as linhas que
 * `aplicarPromocoes` devolveu e desconta sobre o que o cliente já paga.
 *
 * As regras, em ordem de importância:
 *
 * 1. **O cupom não se soma à promoção do mesmo item.** Ele só age em item sem
 *    promoção automática — a menos que o cupom ligue `valeEmPromocao`, o que a
 *    loja escolhe cupom a cupom. Desconto empilhado come a margem sem que a loja
 *    tenha escolhido isso. O combo conta como item em promoção: o preço dele já é
 *    o especial.
 * 2. **O desconto é sobre o que o item custa** (o total da linha, com os
 *    adicionais): "10% OFF" é 10% do que o cliente pagaria por aqueles itens.
 * 3. **O desconto nunca passa do que os itens alcançados custam**, nem do teto
 *    (`descontoMaximo`) do cupom em %. A taxa de entrega não tem cupom.
 * 4. **O pedido mínimo do cupom** conta os itens da sacola inteira, já com as
 *    promoções e antes do cupom — não só os que o cupom alcança.
 */

/** Letras, números, hífen e sublinhado; de 3 a 20 caracteres. */
export const CODIGO_DO_CUPOM = /^[A-Z0-9_-]{3,20}$/;

/** "boas-vindas 10 " vira "BOAS-VINDAS10": maiúsculas e sem espaços, como o código é guardado. */
export function normalizarCodigoDoCupom(texto: string): string {
  return texto.replace(/\s+/g, '').toUpperCase();
}

/* ---------------------------------------------------------------------------
 * Quando o cupom vale
 * ------------------------------------------------------------------------- */

export type SituacaoDasDatas = 'VIGENTE' | 'AINDA_NAO' | 'VENCIDO';

/**
 * As datas do cupom contra o calendário da loja (as duas pontas incluídas). O que
 * está vazio não limita.
 */
export function datasDoCupom(
  datas: { inicio: string | null; fim: string | null },
  agora: Date,
): SituacaoDasDatas {
  const { data } = momentoNaLoja(agora);
  if (datas.inicio !== null && data < datas.inicio) return 'AINDA_NAO';
  if (datas.fim !== null && data > datas.fim) return 'VENCIDO';
  return 'VIGENTE';
}

/* ---------------------------------------------------------------------------
 * O desconto
 * ------------------------------------------------------------------------- */

export type ResultadoDoCupom =
  | {
      ok: true;
      /** O desconto no total do pedido. */
      descontoCentavos: number;
      /** Quanto custam os itens que o cupom alcançou: a base da conta. */
      elegivelCentavos: number;
    }
  | {
      ok: false;
      motivo: 'SEM_ITEM_ELEGIVEL';
      /** Há itens no alcance do cupom, mas todos já têm promoção. */
      porPromocao: boolean;
    }
  | {
      ok: false;
      motivo: 'ABAIXO_DO_MINIMO';
      minimoCentavos: number;
      faltamCentavos: number;
    };

/** A linha está no alcance do cupom: qualquer uma, ou o produto ou a seção listados. */
function noAlcance(cupom: CupomPublico, linha: LinhaPrecificada): boolean {
  if (cupom.produtoIds.length === 0 && cupom.categoriaIds.length === 0) return true;
  return (
    cupom.produtoIds.includes(linha.produtoId) ||
    (linha.categoriaId !== null && cupom.categoriaIds.includes(linha.categoriaId))
  );
}

/** A linha já recebeu desconto de promoção automática — ou é um combo, que já é preço especial. */
function emPromocao(linha: LinhaPrecificada): boolean {
  return linha.combo === true || (linha.promocaoId !== null && linha.descontoCentavos > 0);
}

/**
 * O desconto do cupom sobre as linhas que `aplicarPromocoes` devolveu. Não confere
 * o que só o servidor sabe (ativo, datas, usos): isso é dele, antes desta conta.
 */
export function aplicarCupom(linhas: LinhaPrecificada[], cupom: CupomPublico): ResultadoDoCupom {
  const alcancadas = linhas.filter((linha) => noAlcance(cupom, linha));
  const elegiveis = alcancadas.filter((linha) => cupom.valeEmPromocao || !emPromocao(linha));
  if (elegiveis.length === 0) {
    return { ok: false, motivo: 'SEM_ITEM_ELEGIVEL', porPromocao: alcancadas.length > 0 };
  }

  const subtotal = linhas.reduce((soma, linha) => soma + linha.totalCentavos, 0);
  const minimo = cupom.pedidoMinimo === null ? 0 : emCentavos(cupom.pedidoMinimo);
  if (subtotal < minimo) {
    return {
      ok: false,
      motivo: 'ABAIXO_DO_MINIMO',
      minimoCentavos: minimo,
      faltamCentavos: minimo - subtotal,
    };
  }

  const elegivel = elegiveis.reduce((soma, linha) => soma + linha.totalCentavos, 0);
  let desconto: number;
  if (cupom.tipo === 'PERCENTUAL') {
    desconto = Math.round((elegivel * (cupom.percentual ?? 0)) / 100);
    if (cupom.descontoMaximo !== null)
      desconto = Math.min(desconto, emCentavos(cupom.descontoMaximo));
  } else {
    desconto = emCentavos(cupom.valor ?? 0);
  }
  return {
    ok: true,
    descontoCentavos: Math.max(0, Math.min(desconto, elegivel)),
    elegivelCentavos: elegivel,
  };
}

function brl(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}

/** Por que o cupom não vale para esta sacola, na língua do cliente. */
export function mensagemDoCupom(recusa: Extract<ResultadoDoCupom, { ok: false }>): string {
  if (recusa.motivo === 'ABAIXO_DO_MINIMO') {
    return `Faltam ${brl(recusa.faltamCentavos)} em itens para usar este cupom (pedido mínimo de ${brl(recusa.minimoCentavos)}).`;
  }
  return recusa.porPromocao
    ? 'Os itens da sua sacola já estão em promoção, e este cupom não vale junto.'
    : 'Este cupom não vale para os itens da sua sacola.';
}
