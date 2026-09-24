'use client';

import { useEffectEvent, useLayoutEffect } from 'react';
import { useAnimate } from 'motion/react';
import { DURACAO } from './movimento';
import { textoSobre } from './paleta';

/**
 * O item adicionado viajando do botão até a sacola.
 *
 * É o único movimento longo da loja, e é longo porque é uma viagem: liga o
 * toque em "Adicionar" ao lugar onde o item foi parar. Sem ele, a folha fecha e
 * o cliente fica sem saber se o toque pegou — e costuma tocar de novo,
 * adicionando dois.
 *
 * Um círculo com "+N", e não uma foto do produto voando: sem foto, uma imagem
 * genérica diria menos do que a quantidade.
 *
 * Quem pediu menos movimento no sistema não vê o voo — a página nem o monta. A
 * confirmação vem pelos números da barra, que trocam sem deslocamento.
 */

const TAMANHO = 36;

/**
 * Distância entre a base da tela e o centro do ícone da barra, quando ela já
 * terminou de entrar: `p-3` (12px) mais metade de `h-13` (26px).
 */
const CENTRO_DA_BARRA = 38;

/** Quanto o arco sobe acima do ponto mais alto da viagem. */
const ALTURA_DO_ARCO = 70;

export function VooParaASacola({
  de,
  alvo,
  rotulo,
  cor,
  onChegou,
}: {
  /** Onde estava o botão no instante do toque. */
  de: DOMRect;
  /** Mede o ícone da sacola. Chamado uma vez, no início do voo. */
  alvo: () => DOMRect | null;
  rotulo: string;
  cor: string;
  onChegou: () => void;
}) {
  const [escopo, animar] = useAnimate<HTMLDivElement>();

  const inicioX = de.left + de.width / 2;
  const inicioY = de.top + de.height / 2;

  // Effect events: o voo lê a versão mais recente dessas funções sem recomeçar
  // cada vez que a página renderiza — e ela renderiza durante o voo, porque a
  // sacola acabou de mudar.
  const medirAlvo = useEffectEvent(alvo);
  const aoChegar = useEffectEvent(onChegou);

  useLayoutEffect(() => {
    const destino = medirAlvo();
    const baseDaBarra = window.innerHeight - CENTRO_DA_BARRA;

    const fimX = destino ? destino.left + destino.width / 2 : window.innerWidth / 2;
    // Na primeira adição a barra ainda está subindo, e medir agora daria um
    // ponto abaixo da tela. O destino é onde ela vai parar.
    const fimY = destino ? Math.min(destino.top + destino.height / 2, baseDaBarra) : baseDaBarra;

    const dx = fimX - inicioX;
    const dy = fimY - inicioY;
    const pico = Math.min(0, dy) - ALTURA_DO_ARCO;

    const elemento = escopo.current;
    let vivo = true;

    // Horizontal e vertical com curvas diferentes é o que desenha o arco: o
    // deslocamento lateral é constante, e o vertical sobe e depois cai.
    Promise.all([
      animar(elemento, { x: [0, dx] }, { duration: DURACAO.voo, ease: [0.3, 0, 0.6, 1] }),
      animar(
        elemento,
        { y: [0, pico, dy] },
        { duration: DURACAO.voo, times: [0, 0.4, 1], ease: ['easeOut', 'easeIn'] },
      ),
      animar(elemento, { scale: [1, 1, 0.5] }, { duration: DURACAO.voo, times: [0, 0.5, 1] }),
      animar(elemento, { opacity: [1, 1, 0] }, { duration: DURACAO.voo, times: [0, 0.85, 1] }),
    ]).then(() => {
      if (vivo) aoChegar();
    });

    return () => {
      vivo = false;
    };
  }, [animar, escopo, inicioX, inicioY]);

  return (
    <div
      ref={escopo}
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] flex items-center justify-center rounded-full text-sm font-bold shadow-md"
      style={{
        left: inicioX - TAMANHO / 2,
        top: inicioY - TAMANHO / 2,
        width: TAMANHO,
        height: TAMANHO,
        backgroundColor: cor,
        color: textoSobre(cor),
      }}
    >
      {rotulo}
    </div>
  );
}
