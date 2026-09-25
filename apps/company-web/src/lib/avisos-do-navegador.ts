'use client';

import { useSyncExternalStore } from 'react';

/**
 * Som e notificação pelo navegador — o que dá para fazer sem servidor de push.
 *
 * O limite precisa ficar dito onde é usado: tudo aqui depende de a página
 * estar aberta em alguma aba. Com o navegador fechado, só o push de servidor
 * (Web Push) alcança o aparelho, e ele ainda não existe neste sistema. O push
 * que existe hoje é o do aplicativo do motoboy, no Android, por outro caminho.
 */

/* ---------------------------------------------------------------------------
 * Som
 * ------------------------------------------------------------------------- */

let contexto: AudioContext | null = null;
let liberado = false;
const ouvintesDoSom = new Set<() => void>();

function avisarSom(): void {
  for (const ouvinte of ouvintesDoSom) ouvinte();
}

function criarContexto(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  contexto ??= new window.AudioContext();
  return contexto;
}

/**
 * Os navegadores só deixam uma página tocar som depois de um gesto de quem
 * está nela — um clique, uma tecla. Esta função fica esperando esse primeiro
 * gesto e libera o som ali; antes dele, o aviso sonoro simplesmente não toca.
 *
 * Devolve a função que para de esperar.
 */
export function liberarSomNoPrimeiroToque(): () => void {
  if (typeof window === 'undefined') return () => {};

  const liberar = () => {
    const audio = criarContexto();
    if (!audio) return;
    void audio.resume().then(() => {
      liberado = audio.state === 'running';
      avisarSom();
    });
  };

  window.addEventListener('pointerdown', liberar, { once: true });
  window.addEventListener('keydown', liberar, { once: true });
  return () => {
    window.removeEventListener('pointerdown', liberar);
    window.removeEventListener('keydown', liberar);
  };
}

/** Se o som já foi liberado por um gesto nesta página. */
export function useSomLiberado(): boolean {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesDoSom.add(ouvinte);
      return () => ouvintesDoSom.delete(ouvinte);
    },
    () => liberado,
    () => false,
  );
}

function nota(
  audio: AudioContext,
  frequencia: number,
  inicio: number,
  duracao: number,
  volume: number,
): void {
  const oscilador = audio.createOscillator();
  const ganho = audio.createGain();
  oscilador.type = 'sine';
  oscilador.frequency.value = frequencia;
  // Ataque curto e caída exponencial: soa como sino, e não como bipe de
  // alarme. O zero exato não existe na rampa exponencial, daí o 0.0001.
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.015);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  oscilador.connect(ganho).connect(audio.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracao + 0.05);
}

/**
 * Toca o aviso. Dois sons, para a cozinha distinguir sem olhar:
 *
 * - `pedido`: subindo, e repetido — é o que precisa de alguém agora.
 * - `lembrete`: um descendente só — a loja vai fechar, chegou a hora de um
 *   agendado. Informa, sem chamar ninguém correndo.
 *
 * Sintetizado, e não um arquivo de áudio: nada a baixar, nada a guardar em
 * cache, e toca igual em qualquer navegador.
 *
 * Devolve falso quando não tocou — som ainda não liberado, ou navegador sem
 * áudio.
 */
export function tocarAviso(tipo: 'pedido' | 'lembrete' = 'pedido'): boolean {
  const audio = contexto;
  if (!audio || audio.state !== 'running') return false;
  const t = audio.currentTime + 0.02;
  if (tipo === 'pedido') {
    nota(audio, 784, t, 0.22, 0.28);
    nota(audio, 1047, t + 0.16, 0.3, 0.28);
    nota(audio, 784, t + 0.62, 0.22, 0.28);
    nota(audio, 1047, t + 0.78, 0.3, 0.28);
  } else {
    nota(audio, 880, t, 0.3, 0.22);
    nota(audio, 659, t + 0.2, 0.45, 0.22);
  }
  return true;
}

/**
 * Para o botão "Testar som": o próprio clique é o gesto que o navegador exige,
 * então libera e toca na mesma hora.
 */
export async function testarSom(tipo: 'pedido' | 'lembrete' = 'pedido'): Promise<boolean> {
  const audio = criarContexto();
  if (!audio) return false;
  try {
    await audio.resume();
  } catch {
    return false;
  }
  liberado = audio.state === 'running';
  avisarSom();
  return tocarAviso(tipo);
}

/* ---------------------------------------------------------------------------
 * Notificação
 * ------------------------------------------------------------------------- */

export type PermissaoDeNotificacao = NotificationPermission | 'indisponivel';

export function permissaoDeNotificacao(): PermissaoDeNotificacao {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel';
  return window.Notification.permission;
}

/** Pede a permissão. Só depois de um toque de quem usa: pedir sozinho, ao abrir, é recusado. */
export async function pedirPermissaoDeNotificacao(): Promise<PermissaoDeNotificacao> {
  if (permissaoDeNotificacao() === 'indisponivel') return 'indisponivel';
  try {
    return await window.Notification.requestPermission();
  } catch {
    return permissaoDeNotificacao();
  }
}

export interface OpcoesDaNotificacao {
  corpo: string;
  /** Notificação com a mesma etiqueta substitui a anterior, em vez de empilhar. */
  etiqueta?: string;
  icone?: string;
  /** Escopo do service worker que deve mostrá-la, quando houver um. */
  escopo?: string;
}

/**
 * Mostra uma notificação do sistema, se houver permissão.
 *
 * Tenta primeiro pelo service worker: no Chrome do Android, `new Notification`
 * não existe — só a notificação do worker. No computador, e onde não há
 * worker (em desenvolvimento ele nem é registrado), vai pela notificação da
 * página.
 */
export async function mostrarNotificacao(
  titulo: string,
  opcoes: OpcoesDaNotificacao,
): Promise<boolean> {
  if (permissaoDeNotificacao() !== 'granted') return false;
  const dados: NotificationOptions = { body: opcoes.corpo };
  if (opcoes.etiqueta) dados.tag = opcoes.etiqueta;
  if (opcoes.icone) dados.icon = opcoes.icone;

  try {
    const registro =
      opcoes.escopo && 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration(opcoes.escopo)
        : undefined;
    if (registro) {
      await registro.showNotification(titulo, dados);
      return true;
    }
  } catch {
    // Sem worker utilizável: segue para a notificação da página.
  }

  try {
    const notificacao = new window.Notification(titulo, dados);
    // Tocar na notificação traz a aba de volta, que é o que a pessoa quer.
    notificacao.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}
