'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CupomDaLoja,
  DestaqueDaLoja,
  PromocaoDaLoja,
  PromocaoPublica,
  TipoDePromocao,
} from '@motoboycity/types';
import { datasDoCupom, momentoNaLoja, promocaoVigente } from '@motoboycity/validation';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { descricaoDoCupom } from '@/lib/loja-cupons';
import { session } from '@/lib/session';

/**
 * Marketing no painel: a consulta das promoções e o que as telas dividem.
 *
 * As regras de preço (quando vale, quanto desconta) NÃO estão aqui: moram em
 * `packages/validation`, as mesmas que a página do cliente e o servidor usam.
 * Este arquivo só diz, em português, em que pé a promoção está.
 */

export const CHAVE_DAS_PROMOCOES = ['company', 'store', 'marketing', 'promotions'] as const;

export function usePromocoes() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DAS_PROMOCOES,
    queryFn: () => companyStoreMarketingApi.promotions(token as string),
    enabled: Boolean(token),
  });
}

export const NOMES_DOS_TIPOS: Record<TipoDePromocao, string> = {
  PERCENTUAL: 'Desconto em %',
  PRECO: 'Preço promocional',
  LEVE_PAGUE: 'Leve mais, pague menos',
  SEGUNDO_COM_DESCONTO: 'Segundo com desconto',
};

export type CodigoDaSituacao = 'NO_AR' | 'DESLIGADA' | 'AGENDADA' | 'ENCERRADA' | 'ESGOTADA';

export interface SituacaoDaPromocao {
  codigo: CodigoDaSituacao;
  texto: string;
  classe: string;
  /** Quando está no ar mas o horário ou o dia da semana não é agora. */
  foraDoHorario: boolean;
}

/** Uma promoção que já usou tudo o que podia. */
export function estaEsgotada(promocao: PromocaoDaLoja): boolean {
  return promocao.limiteDeUsos !== null && promocao.usos >= promocao.limiteDeUsos;
}

/** Em que pé a promoção está: no ar, desligada, por começar, encerrada ou esgotada. */
export function situacaoDaPromocao(promocao: PromocaoDaLoja, agora: Date): SituacaoDaPromocao {
  const feito = (
    codigo: CodigoDaSituacao,
    texto: string,
    classe: string,
    foraDoHorario = false,
  ): SituacaoDaPromocao => ({ codigo, texto, classe, foraDoHorario });

  if (!promocao.ativa) return feito('DESLIGADA', 'Desligada', 'bg-muted text-muted-foreground');
  if (estaEsgotada(promocao)) {
    return feito('ESGOTADA', 'Esgotada', 'bg-destructive-soft text-destructive-text');
  }
  const { data } = momentoNaLoja(agora);
  if (promocao.fim !== null && data > promocao.fim) {
    return feito('ENCERRADA', 'Encerrada', 'bg-muted text-muted-foreground');
  }
  if (promocao.inicio !== null && data < promocao.inicio) {
    return feito(
      'AGENDADA',
      'Agendada',
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    );
  }
  return feito(
    'NO_AR',
    'No ar',
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    !promocaoVigente(promocao, agora),
  );
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function dataCurta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "Seg a sex, 11:00 às 14:00, de 01/10/2026 a 31/10/2026" — ou `null` se vale sempre. */
export function quandoVale(promocao: PromocaoPublica): string | null {
  const partes: string[] = [];
  if (promocao.diasDaSemana.length > 0) {
    partes.push(promocao.diasDaSemana.map((dia) => DIAS_CURTOS[dia] ?? '').join(', '));
  }
  if (promocao.horaInicio !== null && promocao.horaFim !== null) {
    partes.push(`${promocao.horaInicio} às ${promocao.horaFim}`);
  }
  if (promocao.inicio !== null && promocao.fim !== null) {
    partes.push(`de ${dataCurta(promocao.inicio)} a ${dataCurta(promocao.fim)}`);
  } else if (promocao.inicio !== null) {
    partes.push(`a partir de ${dataCurta(promocao.inicio)}`);
  } else if (promocao.fim !== null) {
    partes.push(`até ${dataCurta(promocao.fim)}`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** O que a promoção faz, numa frase: "20% de desconto", "Leve 3, pague 2". */
export function descricaoDaPromocao(promocao: PromocaoPublica): string {
  switch (promocao.tipo) {
    case 'PERCENTUAL':
      return `${promocao.percentual ?? 0}% de desconto`;
    case 'PRECO':
      return `Por R$ ${(promocao.precoPromocional ?? 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case 'LEVE_PAGUE':
      return `Leve ${promocao.leve ?? 0}, pague ${promocao.pague ?? 0}`;
    case 'SEGUNDO_COM_DESCONTO':
      return promocao.percentual === 100
        ? 'Leve 2, o segundo é grátis'
        : `Segundo com ${promocao.percentual ?? 0}% de desconto`;
  }
}

/* ---------------------------------------------------------------------------
 * Cupons
 * ------------------------------------------------------------------------- */

export const CHAVE_DOS_CUPONS = ['company', 'store', 'marketing', 'coupons'] as const;

export function useCupons() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DOS_CUPONS,
    queryFn: () => companyStoreMarketingApi.coupons(token as string),
    enabled: Boolean(token),
  });
}

/** Um cupom que já usou tudo o que podia. */
export function cupomEsgotado(cupom: CupomDaLoja): boolean {
  return cupom.limiteDeUsos !== null && cupom.usos >= cupom.limiteDeUsos;
}

/** Em que pé o cupom está: no ar, desligado, por começar, encerrado ou esgotado. */
export function situacaoDoCupom(cupom: CupomDaLoja, agora: Date): SituacaoDaPromocao {
  const feito = (codigo: CodigoDaSituacao, texto: string, classe: string): SituacaoDaPromocao => ({
    codigo,
    texto,
    classe,
    foraDoHorario: false,
  });
  if (!cupom.ativo) return feito('DESLIGADA', 'Desligado', 'bg-muted text-muted-foreground');
  if (cupomEsgotado(cupom)) {
    return feito('ESGOTADA', 'Esgotado', 'bg-destructive-soft text-destructive-text');
  }
  const datas = datasDoCupom(cupom, agora);
  if (datas === 'VENCIDO') return feito('ENCERRADA', 'Encerrado', 'bg-muted text-muted-foreground');
  if (datas === 'AINDA_NAO') {
    return feito(
      'AGENDADA',
      'Agendado',
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    );
  }
  return feito(
    'NO_AR',
    'No ar',
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  );
}

function emReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// O texto do cupom mora em `lib/loja-cupons.ts`: o checkout do cliente lê o mesmo.
export { descricaoDoCupom };

/**
 * As regras do cupom que a lista mostra em letra miúda: mínimo, onde vale, se
 * vale em item em promoção, período e limites. Só o que o cupom tem.
 */
export function regrasDoCupom(
  cupom: Pick<
    CupomDaLoja,
    | 'pedidoMinimo'
    | 'produtoIds'
    | 'categoriaIds'
    | 'valeEmPromocao'
    | 'mostrarNoCheckout'
    | 'inicio'
    | 'fim'
    | 'limiteDeUsos'
    | 'limitePorCliente'
  > & {
    /** Quantos pedidos já usaram. Sem isto (o formulário, antes de salvar), diz só o limite. */
    usos?: number;
  },
): string[] {
  const partes: string[] = [];
  if (cupom.pedidoMinimo !== null) partes.push(`a partir de ${emReais(cupom.pedidoMinimo)}`);
  const produtos = cupom.produtoIds.length;
  const secoes = cupom.categoriaIds.length;
  if (produtos + secoes > 0) {
    const onde: string[] = [];
    if (produtos > 0) onde.push(`${produtos} ${produtos === 1 ? 'produto' : 'produtos'}`);
    if (secoes > 0) onde.push(`${secoes} ${secoes === 1 ? 'seção' : 'seções'}`);
    partes.push(`só em ${onde.join(' e ')}`);
  } else {
    partes.push('em todos os itens');
  }
  partes.push(cupom.valeEmPromocao ? 'vale em item em promoção' : 'só em item sem promoção');
  partes.push(cupom.mostrarNoCheckout ? 'aparece no checkout' : 'só com o código');
  if (cupom.inicio !== null && cupom.fim !== null) {
    partes.push(`de ${dataCurta(cupom.inicio)} a ${dataCurta(cupom.fim)}`);
  } else if (cupom.inicio !== null) {
    partes.push(`a partir de ${dataCurta(cupom.inicio)}`);
  } else if (cupom.fim !== null) {
    partes.push(`até ${dataCurta(cupom.fim)}`);
  }
  if (cupom.limiteDeUsos !== null) {
    partes.push(
      cupom.usos === undefined
        ? `limitado a ${cupom.limiteDeUsos} pedidos`
        : `${cupom.usos} de ${cupom.limiteDeUsos} usos`,
    );
  } else if (cupom.usos !== undefined && cupom.usos > 0) {
    partes.push(`${cupom.usos} ${cupom.usos === 1 ? 'uso' : 'usos'}`);
  }
  if (cupom.limitePorCliente !== null) {
    partes.push(
      cupom.limitePorCliente === 1
        ? '1 uso por cliente'
        : `${cupom.limitePorCliente} usos por cliente`,
    );
  }
  return partes;
}

/* ---------------------------------------------------------------------------
 * Destaques
 * ------------------------------------------------------------------------- */

export const CHAVE_DOS_DESTAQUES = ['company', 'store', 'marketing', 'highlights'] as const;

/** A fila das gravações de ordem: uma de cada vez, para a última vencer. */
export const CHAVE_DA_ORDEM_DOS_DESTAQUES = [
  'company',
  'store',
  'marketing',
  'highlights-order',
] as const;

export function useDestaques() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DOS_DESTAQUES,
    queryFn: () => companyStoreMarketingApi.highlights(token as string),
    enabled: Boolean(token),
  });
}

/** Em que pé o destaque está: no ar, desligado, por começar ou encerrado. */
export function situacaoDoDestaque(destaque: DestaqueDaLoja, agora: Date): SituacaoDaPromocao {
  const feito = (codigo: CodigoDaSituacao, texto: string, classe: string): SituacaoDaPromocao => ({
    codigo,
    texto,
    classe,
    foraDoHorario: false,
  });
  if (!destaque.ativo) return feito('DESLIGADA', 'Desligado', 'bg-muted text-muted-foreground');
  const datas = datasDoCupom(destaque, agora);
  if (datas === 'VENCIDO') return feito('ENCERRADA', 'Encerrado', 'bg-muted text-muted-foreground');
  if (datas === 'AINDA_NAO') {
    return feito(
      'AGENDADA',
      'Agendado',
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    );
  }
  return feito(
    'NO_AR',
    'No ar',
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  );
}

/** "de 01/10/2026 a 31/10/2026", "a partir de …", "até …" — ou `null` se vale sempre. */
export function periodoDoDestaque(destaque: Pick<DestaqueDaLoja, 'inicio' | 'fim'>): string | null {
  if (destaque.inicio !== null && destaque.fim !== null) {
    return `de ${dataCurta(destaque.inicio)} a ${dataCurta(destaque.fim)}`;
  }
  if (destaque.inicio !== null) return `a partir de ${dataCurta(destaque.inicio)}`;
  if (destaque.fim !== null) return `até ${dataCurta(destaque.fim)}`;
  return null;
}
