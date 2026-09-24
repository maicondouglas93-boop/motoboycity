'use client';

import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';

/**
 * O vocabulário de movimento da loja do cliente.
 *
 * Toda animação daqui para baixo tira os tempos e curvas deste arquivo, e não
 * de números soltos em cada componente. Movimento inconsistente — uma folha que
 * sobe em 300ms e outra em 180ms, uma com mola e outra sem — é exatamente o que
 * faz uma interface parecer montada às pressas.
 *
 * Três regras valem para tudo:
 *
 * - **Curto.** Nada passa de ~450ms, e a maioria fica abaixo de 250ms. O cliente
 *   veio pedir comida; animação que ele espera terminar é atrito.
 * - **Sem quique.** Curvas que desaceleram e param, sem ultrapassar o destino.
 *   Quique é o que faz app de entrega parecer brinquedo.
 * - **Só transform e opacity** sempre que der, porque são as duas propriedades
 *   que o navegador anima na GPU sem recalcular o layout — é o que segura os
 *   60fps num celular de entrada.
 */

/** A curva das folhas de baixo: sai rápido e assenta devagar, como no iOS. */
export const CURVA_FOLHA = [0.32, 0.72, 0, 1] as const;

/** Saída: acelera ao sair, para não parecer que a coisa hesita. */
export const CURVA_SAIDA = [0.4, 0, 1, 1] as const;

/** Entrada comum: desacelera no fim. */
export const CURVA_ENTRADA = [0, 0, 0.2, 1] as const;

export const DURACAO = {
  /** Troca de número, pulso de confirmação. */
  instante: 0.16,
  /** Entrada de linha, troca de seção no checkout. */
  curta: 0.22,
  /** Folha abrindo. */
  folha: 0.32,
  /** O item voando até a sacola: o único movimento longo, porque é viagem. */
  voo: 0.45,
} as const;

/**
 * `domMax`, e não o pacote menor `domAnimation`, por duas coisas que só ele traz:
 * arrastar a folha para baixo para fechar — o gesto que todo mundo tenta num
 * celular — e o `layoutId` do indicador de categoria, que corrige a distorção
 * do arredondamento enquanto ele desliza de uma largura para outra.
 *
 * `strict` faz qualquer `motion.div` acidental quebrar em desenvolvimento, em vez
 * de puxar silenciosamente o pacote inteiro para o bundle da loja.
 *
 * `reducedMotion="user"` respeita a preferência do sistema: quem pediu menos
 * movimento fica sem deslocamentos e escalas, e mantém só as trocas de
 * opacidade, que não causam enjoo.
 */
export function MovimentoDaLoja({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
