'use client';

import { useSyncExternalStore } from 'react';

/**
 * O "esta página pode ser instalada" do navegador, guardado para a hora certa.
 *
 * O Chrome, o Edge e o navegador da Samsung avisam com o evento
 * `beforeinstallprompt` — uma vez por carregamento de página, e quase sempre bem
 * antes de o cliente chegar à confirmação do pedido, que é onde o convite faz
 * sentido. Por isso o evento é capturado cedo, no layout da loja, e guardado
 * aqui até alguém pedir.
 *
 * O iPhone não tem esse evento, nem instalação por botão: lá o único caminho é
 * Compartilhar → "Adicionar à Tela de Início", e o convite ensina os passos.
 */

/** O evento do Chrome. Não está nos tipos padrão do TypeScript. */
interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let adiado: EventoDeInstalacao | null = null;
let escutando = false;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * Começa a escutar. Tem de ser chamado ANTES de registrar o service worker: é o
 * worker ativo que torna a página instalável, e o evento pode disparar logo em
 * seguida — sem ninguém ouvindo, ele se perde até o próximo carregamento.
 */
export function escutarInstalacao(): void {
  if (escutando || typeof window === 'undefined') return;
  escutando = true;

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sem isto o Chrome mostraria a própria faixa de instalação logo na primeira
    // visita — antes de o cliente ter qualquer motivo para voltar.
    evento.preventDefault();
    adiado = evento as EventoDeInstalacao;
    avisar();
  });

  window.addEventListener('appinstalled', () => {
    adiado = null;
    avisar();
  });
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Se o navegador aceita instalar por botão agora. */
export function usePodeInstalar(): boolean {
  return useSyncExternalStore(
    assinar,
    () => adiado !== null,
    () => false,
  );
}

/**
 * Abre o diálogo de instalação do próprio navegador.
 *
 * O evento só serve uma vez — depois do `prompt`, o Chrome não aceita outro com
 * o mesmo objeto. Por isso ele é descartado antes de ser usado.
 */
export async function pedirInstalacao(): Promise<'aceito' | 'recusado' | 'indisponivel'> {
  const evento = adiado;
  if (!evento) return 'indisponivel';
  adiado = null;
  avisar();

  await evento.prompt();
  const { outcome } = await evento.userChoice;
  return outcome === 'accepted' ? 'aceito' : 'recusado';
}

/** Já está aberto como app instalado — aí o convite não faz sentido. */
export function jaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const naTelaInicialDoIphone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || naTelaInicialDoIphone === true;
}

/**
 * iPhone ou iPad. O iPad recente se apresenta como Mac; o que o denuncia é a
 * tela de toque.
 */
export function eIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/** Quanto tempo o convite descansa depois de um "agora não". */
export const DIAS_DE_DESCANSO = 30;

/**
 * Se o convite pode aparecer, dado quando foi dispensado pela última vez.
 *
 * Pura, e não lendo o relógio sozinha, para dar para testar sem esperar trinta
 * dias.
 */
export function conviteLiberado(dispensadoEm: number | null, agora: number): boolean {
  if (dispensadoEm === null) return true;
  return agora - dispensadoEm >= DIAS_DE_DESCANSO * 24 * 60 * 60 * 1000;
}

/** Testes precisam começar de um estado limpo. */
export function reiniciarParaTeste(): void {
  adiado = null;
  avisar();
}
