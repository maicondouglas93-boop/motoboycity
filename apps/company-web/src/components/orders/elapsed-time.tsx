'use client';

import { useSyncExternalStore } from 'react';

/**
 * Um relógio só para a tela inteira.
 *
 * Uma central com trinta pedidos criaria trinta `setInterval` se cada linha
 * cuidasse do próprio tempo. Aqui existe um único intervalo, e as linhas se
 * inscrevem nele — todas viram o mesmo instante, o que também evita o efeito
 * de contadores piscando fora de sincronia.
 *
 * `useSyncExternalStore` e não `useEffect` + `setState`: é o primitivo do React
 * para assinar uma fonte externa, e evita o render em cascata que um setState
 * síncrono dentro do efeito provoca.
 */
let currentNow = 0;
const subscribers = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);

  if (ticker === null) {
    currentNow = Date.now();
    ticker = setInterval(() => {
      currentNow = Date.now();
      for (const subscriber of subscribers) {
        subscriber();
      }
    }, 1000);
  }

  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/**
 * O servidor devolve 0 e o componente não desenha nada até o cliente assumir.
 * Um `Date.now()` no servidor divergiria do primeiro render no navegador e o
 * React acusaria erro de hidratação.
 */
function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => currentNow,
    () => 0,
  );
}

/**
 * Formato curto de operação: segundos até um minuto, minutos com segundos até
 * uma hora, e horas com minutos depois disso. Quem lê a fila quer saber a
 * ordem de grandeza num relance, não o valor exato.
 */
export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}m ${String(totalSeconds % 60).padStart(2, '0')}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}h ${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')}m`;
}

/**
 * Há quanto tempo o pedido está no estado atual.
 *
 * Sem cor de alerta de propósito: "demorado" depende de um limite que ninguém
 * decidiu ainda, e pintar de vermelho um número arbitrário treinaria o
 * operador a ignorar a cor. O tempo em si já é a informação.
 */
export function ElapsedTime({ since, className = '' }: { since: string; className?: string }) {
  const now = useNow();
  const startedAt = new Date(since).getTime();

  if (now === 0 || Number.isNaN(startedAt)) {
    return null;
  }

  return (
    <span className={`font-mono text-xs tabular-nums text-muted-foreground ${className}`}>
      {formatElapsed(now - startedAt)}
    </span>
  );
}
