'use client';

import type { InscricaoDoNavegador } from '@motoboycity/api-client';
import { webPushApi } from '@/lib/api-client';

/**
 * O Web Push no navegador: inscrever este aparelho para receber os avisos da
 * loja com a página fechada.
 *
 * Quem manda é o servidor (`web-push.service.ts`); aqui só se pede a permissão,
 * se cria a inscrição no service worker certo e se entrega ao servidor o
 * endereço dela. Sem as chaves no servidor, a chave pública vem `null`, e as
 * telas escondem o botão — um botão que não faz nada ensina a não confiar nos
 * outros.
 */

export type SituacaoDoPush =
  | 'carregando'
  /** Este navegador não tem push (no iPhone, só o app instalado tem). */
  | 'sem-suporte'
  /** O servidor está sem as chaves. */
  | 'desligado-no-servidor'
  | 'bloqueado'
  | 'desligado'
  | 'ligado';

export function navegadorTemPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** A chave pública em base64url, como o `subscribe` a quer: em bytes. */
export function chaveEmBytes(chave: string): Uint8Array<ArrayBuffer> {
  const base64 = (chave + '='.repeat((4 - (chave.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const texto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(texto.length));
  for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i);
  return bytes;
}

export async function chavePublicaDoServidor(): Promise<string | null> {
  try {
    return await webPushApi.chavePublica();
  } catch {
    return null;
  }
}

/** A situação deste aparelho num service worker já registrado (ou não). */
export async function situacaoNoRegistro(
  registro: ServiceWorkerRegistration | undefined,
): Promise<SituacaoDoPush> {
  if (!navegadorTemPush()) return 'sem-suporte';
  if (!(await chavePublicaDoServidor())) return 'desligado-no-servidor';
  if (Notification.permission === 'denied') return 'bloqueado';
  const inscricao = await registro?.pushManager.getSubscription();
  return inscricao ? 'ligado' : 'desligado';
}

/** O worker precisa estar ativo para aceitar a inscrição. */
async function ativo(registro: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registro.active) return registro;
  const worker = registro.installing ?? registro.waiting;
  if (!worker) return registro;
  await new Promise<void>((pronto) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') pronto();
    });
  });
  return registro;
}

/**
 * Pede a permissão e inscreve o aparelho. `null`: a pessoa não permitiu — ou o
 * servidor desligou o push no meio do caminho.
 */
export async function inscreverAparelho(
  registro: ServiceWorkerRegistration,
): Promise<InscricaoDoNavegador | null> {
  const chave = await chavePublicaDoServidor();
  if (!chave) return null;
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const pronto = await ativo(registro);
  const inscricao =
    (await pronto.pushManager.getSubscription()) ??
    (await pronto.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveEmBytes(chave),
    }));
  const { endpoint, keys } = inscricao.toJSON();
  if (!endpoint || !keys?.['p256dh'] || !keys['auth']) return null;
  return { endpoint, keys: { p256dh: keys['p256dh'], auth: keys['auth'] } };
}
