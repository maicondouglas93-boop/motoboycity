'use client';

import { useQuery } from '@tanstack/react-query';
import type { PromocaoDaLoja, PromocaoPublica, TipoDePromocao } from '@motoboycity/types';
import { momentoNaLoja, promocaoVigente } from '@motoboycity/validation';
import { companyStoreMarketingApi } from '@/lib/api-client';
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
