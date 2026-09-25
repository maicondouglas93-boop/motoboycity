'use client';

import { useSyncExternalStore } from 'react';

/**
 * A hora da tela — uma só para a página inteira.
 *
 * Telas da loja mudam com o relógio: a pausa que acaba, a loja que abre, o
 * "fecha em 12 min". Com um relógio por componente, cada um andaria num
 * compasso, e uma pausa feita agora poderia parecer ainda não ter começado no
 * componente cujo relógio estava 15 segundos atrás. Aqui há um relógio só,
 * que anda a cada 15 segundos e é acertado na hora:
 *
 * - por quem vai gravar algo que depende da hora (`acertarRelogio`);
 * - quando outra aba muda a loja (evento `storage`) — o painel pausou, e a
 *   página do cliente precisa ver a pausa já começada.
 *
 * Antes da hidratação vale 0: o servidor não sabe a hora de quem abriu a
 * página, e quem mostra texto que depende dela tem que esperar.
 */

let agora = typeof window === 'undefined' ? 0 : Date.now();
const ouvintes = new Set<() => void>();
let intervalo: number | null = null;

function acertar(): void {
  agora = Date.now();
  for (const ouvinte of ouvintes) ouvinte();
}

/** Acerta o relógio agora e devolve a hora, para gravar com a mesma hora que a tela mostra. */
export function acertarRelogio(): number {
  acertar();
  return agora;
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  if (intervalo === null) {
    agora = Date.now();
    intervalo = window.setInterval(acertar, 15_000);
    window.addEventListener('storage', acertar);
  }
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0 && intervalo !== null) {
      window.clearInterval(intervalo);
      window.removeEventListener('storage', acertar);
      intervalo = null;
    }
  };
}

/** Milissegundos desde 1970; 0 antes da hidratação. */
export function useAgora(): number {
  return useSyncExternalStore(
    assinar,
    () => agora,
    () => 0,
  );
}
