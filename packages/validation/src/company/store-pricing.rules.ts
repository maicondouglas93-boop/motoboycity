import type { PromocaoPublica } from '@motoboycity/types';
import { diaDaSemana, emMinutos, momentoNaLoja, somarDias } from './store-schedule.rules';

/**
 * O preço da loja online com promoção: regras puras, em centavos inteiros.
 *
 * Moram neste pacote, e não na tela nem no servidor, porque o servidor recusa o
 * pedido cujo total não bate com o que o cliente viu — e as duas pontas só batem
 * se fizerem a MESMA conta. É a mesma razão de `store-schedule.rules.ts`.
 *
 * As regras, em ordem de importância:
 *
 * 1. **O desconto é do produto, e não dos adicionais.** "20% OFF no açaí" não
 *    muda o preço da granola: a promoção age sobre o preço do produto (ou do
 *    tamanho escolhido).
 * 2. **Promoções não se acumulam.** Cada produto (no mesmo tamanho) recebe UMA
 *    promoção: a que der mais desconto ao cliente naquela compra. Duas ofertas
 *    empilhadas comem a margem de quem vende sem que ele tenha escolhido isso.
 * 3. **Nunca sobe o preço, nunca passa de zero.** Uma promoção que não ajuda o
 *    cliente (o preço "promocional" maior que o atual) simplesmente não age.
 * 4. **Arredondamento em centavos, por unidade.** O desconto de cada unidade é
 *    arredondado uma vez, e a linha soma unidades iguais: o "por R$ 16,00" da
 *    vitrine é exatamente o que o carrinho cobra.
 */

/** Reais para centavos, sem o erro de 0,1 + 0,2. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export function emReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

/* ---------------------------------------------------------------------------
 * Quando a promoção vale
 * ------------------------------------------------------------------------- */

/**
 * A promoção vale neste instante? Datas, horário e dias da semana, todos no
 * calendário e no relógio da loja. O que está vazio não limita.
 */
export function promocaoVigente(promocao: PromocaoPublica, agora: Date): boolean {
  const { data, minutos } = momentoNaLoja(agora);
  let dia = data;

  if (promocao.horaInicio !== null && promocao.horaFim !== null) {
    const de = emMinutos(promocao.horaInicio);
    const ate = emMinutos(promocao.horaFim);
    if (de < ate) {
      if (minutos < de || minutos >= ate) return false;
    } else if (de > ate) {
      // Passa da meia-noite: da madrugada, vale o dia que COMEÇOU ontem.
      if (minutos >= de) dia = data;
      else if (minutos < ate) dia = somarDias(data, -1);
      else return false;
    }
    // `de === ate`: o dia inteiro.
  }

  if (promocao.inicio !== null && dia < promocao.inicio) return false;
  if (promocao.fim !== null && dia > promocao.fim) return false;
  if (promocao.diasDaSemana.length > 0 && !promocao.diasDaSemana.includes(diaDaSemana(dia))) {
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------------------
 * O desconto de cada tipo
 * ------------------------------------------------------------------------- */

/** Uma unidade com `percentual` de desconto, arredondada para o centavo. */
function descontoPercentual(baseCentavos: number, percentual: number): number {
  return Math.round((baseCentavos * percentual) / 100);
}

/**
 * Quanto a promoção tira de `quantidade` unidades de um produto que custa
 * `baseCentavos` cada. Zero quando ela não ajuda (quantidade curta demais para o
 * "leve 3", preço promocional maior que o atual).
 */
export function descontoDaPromocao(
  promocao: PromocaoPublica,
  baseCentavos: number,
  quantidade: number,
): number {
  if (baseCentavos <= 0 || quantidade <= 0) return 0;
  switch (promocao.tipo) {
    case 'PERCENTUAL':
      if (promocao.percentual === null) return 0;
      return quantidade * descontoPercentual(baseCentavos, promocao.percentual);
    case 'PRECO': {
      if (promocao.precoPromocional === null) return 0;
      const porUnidade = baseCentavos - emCentavos(promocao.precoPromocional);
      return quantidade * Math.max(0, porUnidade);
    }
    case 'LEVE_PAGUE': {
      const { leve, pague } = promocao;
      if (leve === null || pague === null || leve <= pague) return 0;
      return Math.floor(quantidade / leve) * (leve - pague) * baseCentavos;
    }
    case 'SEGUNDO_COM_DESCONTO': {
      if (promocao.percentual === null) return 0;
      return Math.floor(quantidade / 2) * descontoPercentual(baseCentavos, promocao.percentual);
    }
  }
}

/** "20% OFF", "Leve 3, pague 2", "2º com 50% OFF", "Preço especial". */
export function rotuloDaPromocao(promocao: PromocaoPublica): string {
  switch (promocao.tipo) {
    case 'PERCENTUAL':
      return `${promocao.percentual ?? 0}% OFF`;
    case 'PRECO':
      return 'Preço especial';
    case 'LEVE_PAGUE':
      return `Leve ${promocao.leve ?? 0}, pague ${promocao.pague ?? 0}`;
    case 'SEGUNDO_COM_DESCONTO':
      return promocao.percentual === 100
        ? 'Leve 2, o 2º é grátis'
        : `2º com ${promocao.percentual ?? 0}% OFF`;
  }
}

/* ---------------------------------------------------------------------------
 * O carrinho
 * ------------------------------------------------------------------------- */

export interface LinhaParaPrecificar {
  /** Identifica a linha para quem chamou: o índice, o id. Volta igual. */
  chave: string;
  produtoId: string;
  categoriaId: string | null;
  tamanhoId: string | null;
  quantidade: number;
  /** O preço do produto (ou do tamanho), sem adicionais. É o que a promoção age. */
  baseCentavos: number;
  /** A soma dos adicionais de UMA unidade. A promoção não os toca. */
  adicionaisCentavos: number;
}

export interface LinhaPrecificada extends LinhaParaPrecificar {
  /** Sem promoção: `(base + adicionais) × quantidade`. */
  originalCentavos: number;
  descontoCentavos: number;
  /** O que a linha custa: é o que o cliente paga. */
  totalCentavos: number;
  /** A promoção que baixou a linha; `null` quando nenhuma ajudou. */
  promocaoId: string | null;
}

/** A promoção é deste produto, ou da seção dele? */
function serve(
  promocao: PromocaoPublica,
  alvo: { produtoId: string; categoriaId: string | null },
): boolean {
  return promocao.alvo === 'PRODUTO'
    ? promocao.produtoId === alvo.produtoId
    : promocao.categoriaId !== null && promocao.categoriaId === alvo.categoriaId;
}

/**
 * Reparte `total` centavos entre as linhas de um grupo, pela quantidade de cada
 * uma. O resto (o centavo que não divide) vai para as primeiras: a soma bate
 * sempre com o desconto do grupo.
 */
function repartir(total: number, quantidades: number[]): number[] {
  const soma = quantidades.reduce((acumulado, q) => acumulado + q, 0);
  const partes = quantidades.map((q) => Math.floor((total * q) / soma));
  let resto = total - partes.reduce((acumulado, parte) => acumulado + parte, 0);
  for (let indice = 0; resto > 0; indice = (indice + 1) % partes.length) {
    partes[indice] = (partes[indice] ?? 0) + 1;
    resto -= 1;
  }
  return partes;
}

/**
 * Aplica as promoções ao carrinho. As unidades do mesmo produto e tamanho formam
 * um grupo — "leve 3" conta as três, ainda que venham em linhas separadas, com
 * adicionais diferentes —, e cada grupo recebe a promoção que mais o baixa.
 *
 * Empate: a primeira da lista, que o servidor entrega na ordem de criação; assim
 * a página e o servidor escolhem a mesma.
 *
 * Devolve as linhas na ordem em que chegaram, e as promoções que de fato baixaram
 * algo (o servidor conta o uso de cada uma).
 */
export function aplicarPromocoes(
  linhas: LinhaParaPrecificar[],
  promocoes: PromocaoPublica[],
  agora: Date,
): { linhas: LinhaPrecificada[]; usadas: string[] } {
  const vigentes = promocoes.filter((promocao) => promocaoVigente(promocao, agora));

  const grupos = new Map<string, number[]>();
  linhas.forEach((linha, indice) => {
    const chave = `${linha.produtoId}|${linha.tamanhoId ?? ''}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), indice]);
  });

  const descontos = linhas.map(() => 0);
  const vencedoras = linhas.map((): string | null => null);

  for (const indices of grupos.values()) {
    const primeira = linhas[indices[0] as number] as LinhaParaPrecificar;
    const unidades = indices.reduce(
      (soma, i) => soma + (linhas[i] as LinhaParaPrecificar).quantidade,
      0,
    );
    let melhor: { promocao: PromocaoPublica; desconto: number } | null = null;
    for (const promocao of vigentes) {
      if (!serve(promocao, primeira)) continue;
      const desconto = descontoDaPromocao(promocao, primeira.baseCentavos, unidades);
      if (desconto > (melhor?.desconto ?? 0)) melhor = { promocao, desconto };
    }
    if (!melhor) continue;
    const { promocao: escolhida, desconto: total } = melhor;
    const partes = repartir(
      total,
      indices.map((i) => (linhas[i] as LinhaParaPrecificar).quantidade),
    );
    indices.forEach((i, posicao) => {
      descontos[i] = partes[posicao] ?? 0;
      vencedoras[i] = (partes[posicao] ?? 0) > 0 ? escolhida.id : null;
    });
  }

  const precificadas = linhas.map((linha, indice): LinhaPrecificada => {
    const originalCentavos = (linha.baseCentavos + linha.adicionaisCentavos) * linha.quantidade;
    const descontoCentavos = descontos[indice] ?? 0;
    return {
      ...linha,
      originalCentavos,
      descontoCentavos,
      totalCentavos: originalCentavos - descontoCentavos,
      promocaoId: vencedoras[indice] ?? null,
    };
  });

  return {
    linhas: precificadas,
    usadas: [
      ...new Set(precificadas.flatMap((linha) => (linha.promocaoId ? [linha.promocaoId] : []))),
    ],
  };
}

/* ---------------------------------------------------------------------------
 * A vitrine
 * ------------------------------------------------------------------------- */

export interface ProdutoParaOferta {
  id: string;
  categoriaId: string | null;
}

export interface OfertaDoProduto {
  promocaoId: string;
  rotulo: string;
  /**
   * Quanto sai de UMA unidade que custa `baseCentavos`. Zero nas promoções de
   * quantidade ("leve 3, pague 2"), que não mudam o preço de uma unidade — para
   * elas a vitrine mostra só o rótulo.
   */
  descontoPorUnidade: (baseCentavos: number) => number;
}

/**
 * A oferta que a vitrine mostra num produto: a que mais baixa o preço de uma
 * unidade do que ele custa hoje (`baseCentavos`, o menor preço, no produto com
 * tamanhos). Sem promoção de preço, a de quantidade aparece só como rótulo. É a
 * mesma escolha do carrinho, para o "por R$ X" da vitrine ser o que se cobra.
 */
export function ofertaDoProduto(
  produto: ProdutoParaOferta,
  baseCentavos: number,
  promocoes: PromocaoPublica[],
  agora: Date,
): OfertaDoProduto | null {
  let melhor: { promocao: PromocaoPublica; desconto: number } | null = null;
  let deQuantidade: PromocaoPublica | null = null;
  for (const promocao of promocoes) {
    if (!promocaoVigente(promocao, agora)) continue;
    if (!serve(promocao, { produtoId: produto.id, categoriaId: produto.categoriaId })) continue;
    if (promocao.tipo === 'PERCENTUAL' || promocao.tipo === 'PRECO') {
      const desconto = descontoDaPromocao(promocao, baseCentavos, 1);
      if (desconto > (melhor?.desconto ?? 0)) melhor = { promocao, desconto };
    } else if (!deQuantidade) {
      deQuantidade = promocao;
    }
  }
  const escolhida = melhor?.promocao ?? deQuantidade;
  if (!escolhida) return null;
  const ehDePreco = escolhida.tipo === 'PERCENTUAL' || escolhida.tipo === 'PRECO';
  return {
    promocaoId: escolhida.id,
    rotulo: rotuloDaPromocao(escolhida),
    descontoPorUnidade: (base) => (ehDePreco ? descontoDaPromocao(escolhida, base, 1) : 0),
  };
}
