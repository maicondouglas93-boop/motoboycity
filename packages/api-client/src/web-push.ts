import type { WebPushSubscriptionPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface WebPushApiConfig {
  baseUrl: string;
}

/** A inscrição do navegador, como `PushSubscription.toJSON()` a devolve. */
export type InscricaoDoNavegador = WebPushSubscriptionPayload;

/** Resposta sem corpo (204): só o erro interessa. */
export async function semCorpoOuErro(response: Response): Promise<void> {
  if (!response.ok) await parseJsonOrThrow<never>(response);
}

/** A chave pública do Web Push. `null`: o push está desligado neste servidor. */
export function createWebPushApi({ baseUrl }: WebPushApiConfig) {
  return {
    async chavePublica(): Promise<string | null> {
      const response = await apiFetch(`${baseUrl}/public/web-push`);
      const { chavePublica } = await parseJsonOrThrow<{ chavePublica: string | null }>(response);
      return chavePublica;
    },
  };
}
