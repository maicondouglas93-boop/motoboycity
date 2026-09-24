'use client';

import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { CURVA_ENTRADA, DURACAO } from './movimento';

/**
 * Um número que rola quando muda, como um contador mecânico.
 *
 * Existe para a mudança ser NOTADA. "2 itens" virando "3 itens" sem movimento
 * passa despercebido — e é justamente a confirmação de que o toque em
 * "Adicionar" funcionou.
 *
 * A direção acompanha o sentido da mudança: aumentar rola para cima, diminuir
 * rola para baixo. Sempre para o mesmo lado, tirar um item pareceria acrescentar.
 */
export function NumeroRolante({
  valor,
  formatar,
}: {
  valor: number;
  formatar?: (valor: number) => string;
}) {
  /*
   * A direção sai da comparação com o valor anterior, guardado em estado e
   * ajustado DURANTE a renderização — o padrão que o React documenta para
   * derivar algo do valor anterior. Num efeito, a primeira renderização com o
   * valor novo já teria saído com a direção errada.
   */
  const [anterior, setAnterior] = useState(valor);
  const [direcao, setDirecao] = useState<1 | -1>(1);
  if (valor !== anterior) {
    setDirecao(valor > anterior ? 1 : -1);
    setAnterior(valor);
  }

  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
        <m.span
          key={valor}
          custom={direcao}
          variants={{
            entra: (sentido: number) => ({ y: sentido > 0 ? '100%' : '-100%', opacity: 0 }),
            fica: { y: 0, opacity: 1 },
            sai: (sentido: number) => ({ y: sentido > 0 ? '-100%' : '100%', opacity: 0 }),
          }}
          initial="entra"
          animate="fica"
          exit="sai"
          transition={{ duration: DURACAO.instante, ease: CURVA_ENTRADA }}
          className="inline-block tabular-nums"
        >
          {formatar ? formatar(valor) : valor}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
