'use client';

import { useImperativeHandle, useRef, type Ref } from 'react';
import { ShoppingBag } from 'lucide-react';
import { m, useAnimate, useReducedMotion } from 'motion/react';
import { CURVA_ENTRADA, CURVA_FOLHA, CURVA_SAIDA, DURACAO } from './movimento';
import { NumeroRolante } from './numero-rolante';
import { moeda, textoSobre } from './paleta';

export interface BarraDaSacolaApi {
  /** O ícone da sacola: é para onde o item adicionado voa. */
  alvo(): DOMRect | null;
  /** O pulso curto de "recebi", disparado quando o item chega. */
  receber(): void;
}

/**
 * A barra fixa que leva à sacola. Só existe quando há algo nela.
 *
 * Três movimentos, cada um dizendo uma coisa:
 *
 * - **entra de baixo** na primeira vez que algo é adicionado — "agora você tem
 *   uma sacola", sem aparecer do nada no meio do toque;
 * - **pulsa de leve** quando o item que voou chega — a sacola recebeu;
 * - **os números rolam** — quantos itens e quanto custa, que é o que o cliente
 *   precisa conferir.
 *
 * Quem a renderiza precisa envolvê-la em `<AnimatePresence>` para ela descer ao
 * esvaziar, em vez de sumir.
 */
export function BarraDaSacola({
  ref,
  itens,
  total,
  corDeAcao,
  onAbrir,
}: {
  ref?: Ref<BarraDaSacolaApi>;
  itens: number;
  total: number;
  corDeAcao: string;
  onAbrir: () => void;
}) {
  const [escopo, animar] = useAnimate<HTMLButtonElement>();
  const icone = useRef<HTMLSpanElement>(null);
  const reduzir = useReducedMotion();

  useImperativeHandle(
    ref,
    () => ({
      alvo: () => icone.current?.getBoundingClientRect() ?? null,
      receber: () => {
        // 3% e não mais: o pulso confirma, não comemora. Quem pediu menos
        // movimento já recebe a confirmação pelos números.
        if (reduzir || !escopo.current) return;
        animar(
          escopo.current,
          { scale: [1, 1.03, 1] },
          { duration: DURACAO.curta, ease: CURVA_ENTRADA },
        );
      },
    }),
    [animar, escopo, reduzir],
  );

  return (
    <m.div
      className="fixed inset-x-0 bottom-0 z-20 p-3"
      initial={{ y: '120%' }}
      animate={{ y: 0, transition: { duration: DURACAO.folha, ease: CURVA_FOLHA } }}
      exit={{ y: '120%', transition: { duration: DURACAO.curta, ease: CURVA_SAIDA } }}
    >
      <button
        ref={escopo}
        type="button"
        onClick={onAbrir}
        className="mx-auto flex h-13 w-full max-w-lg items-center justify-between rounded-xl px-4 text-sm font-semibold shadow-lg"
        style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
      >
        <span className="flex items-center gap-2">
          <span ref={icone} className="flex">
            <ShoppingBag className="size-5" aria-hidden="true" />
          </span>
          <span>
            <NumeroRolante valor={itens} /> {itens === 1 ? 'item' : 'itens'}
          </span>
        </span>
        <span>
          Ver sacola · <NumeroRolante valor={total} formatar={moeda} />
        </span>
      </button>
    </m.div>
  );
}
