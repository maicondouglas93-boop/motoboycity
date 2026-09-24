'use client';

import { m, useReducedMotion } from 'motion/react';
import { CURVA_ENTRADA, CURVA_FOLHA, DURACAO } from './movimento';
import { textoSobre } from './paleta';

/**
 * O "deu certo" do pedido: um check que se desenha, e não um ícone que aparece.
 *
 * O traço sendo feito é o que marca o momento como conclusão — é o fim da compra,
 * o único ponto do fluxo em que vale gastar meio segundo. Sem confete, sem
 * quique, sem escala exagerada: app de entrega que comemora demais parece
 * brinquedo, e o cliente só quer saber que a loja recebeu.
 *
 * Só aparece quando a URL traz o pedido recém-feito (`?novo=`), que é para onde
 * o checkout manda. Entrar em "Meus pedidos" pelo link não a mostra — ela diz
 * "acabou de acontecer", e depois deixa de ser verdade. Recarregar a página ou
 * voltar a ela pelo histórico, com o `?novo=` ainda na URL, repete o desenho.
 *
 * Quem pediu menos movimento vê o check já pronto: o traço sendo desenhado não
 * é transformação, então o `MotionConfig` sozinho não o desligaria.
 */
export function ConfirmacaoDoPedido({ cor }: { cor: string }) {
  const reduzir = useReducedMotion();
  const texto = textoSobre(cor);

  return (
    <m.p
      role="status"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURACAO.curta, ease: CURVA_ENTRADA }}
      className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
      style={{ backgroundColor: cor, color: texto }}
    >
      <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" aria-hidden="true">
        <m.circle
          cx="10"
          cy="10"
          r="8.5"
          stroke={texto}
          strokeWidth="1.5"
          strokeOpacity="0.55"
          initial={reduzir ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.28, ease: CURVA_FOLHA, delay: 0.08 }}
        />
        <m.path
          d="M6 10.3l2.6 2.6L14 7.4"
          stroke={texto}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduzir ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.2, ease: CURVA_ENTRADA, delay: 0.26 }}
        />
      </svg>
      Pedido enviado para a loja.
    </m.p>
  );
}
