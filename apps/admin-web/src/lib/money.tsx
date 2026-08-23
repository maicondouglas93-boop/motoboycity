'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'motoboycity:ocultar-valores';
const MASK = 'R$ ••••';

const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Esconder valores em dinheiro na tela inteira.
 *
 * O dono do negócio mostra o painel para outras pessoas — motoboys, lojistas,
 * visitas — e o faturamento aparece junto. Um botão que troca todo valor por
 * `R$ ••••` resolve isso sem que ele precise fechar a tela.
 *
 * É estado de INTERFACE, guardado no navegador: não vai ao servidor porque não
 * é permissão nem configuração da operação, é preferência de quem está olhando
 * naquele momento.
 */
const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` em vez de `useState` + `useEffect`.
 *
 * `localStorage` é estado externo ao React, e semeá-lo dentro de um efeito é o
 * que a regra `react-hooks/set-state-in-effect` barra — com razão: causa uma
 * renderização a mais e, em SSR, uma janela em que servidor e cliente discordam.
 * Aqui o React cuida disso: `getServerSnapshot` responde "visível" na
 * renderização do servidor e a leitura real acontece na hidratação.
 */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // O evento `storage` só dispara em OUTRAS abas — é o que mantém duas abas do
  // painel de acordo. A própria aba é avisada pelo conjunto de listeners.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  return false;
}

export interface MoneyVisibility {
  hidden: boolean;
  toggle: () => void;
}

export function useMoneyVisibility(): MoneyVisibility {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(!getSnapshot()));
    listeners.forEach((notificar) => notificar());
  }, []);

  return { hidden, toggle };
}

/**
 * O ÚNICO formatador de dinheiro do painel.
 *
 * Antes cada página tinha o seu, e várias chamavam `Intl.NumberFormat` direto —
 * treze cópias no total. Com a máscara dentro de um formatador só, nenhuma tela
 * pode esquecer de escondê-la, e esquecer uma seria pior do que não ter o botão:
 * daria a impressão de estar coberto.
 *
 * `null` NÃO vira "R$ 0,00": valor ausente não é valor zero, e uma entrega sem
 * preço ainda calculado mostraria zero e pareceria de graça. O padrão é um
 * travessão; telas que sabem a razão da ausência passam a própria frase, como
 * "A calcular na entrega".
 *
 * O texto de ausência não é mascarado de propósito: ele não revela valor
 * nenhum, e escondê-lo só tiraria informação de quem olha a tela.
 */
export function useMoney(): (value: number | null | undefined, fallback?: string) => string {
  const { hidden } = useMoneyVisibility();

  return useCallback(
    (value: number | null | undefined, fallback = '—') => {
      if (value === null || value === undefined) return fallback;
      return hidden ? MASK : formatter.format(value);
    },
    [hidden],
  );
}
