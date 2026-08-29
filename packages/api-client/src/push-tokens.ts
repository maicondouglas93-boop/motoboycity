import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface RegisterDeviceTokenInput {
  token: string;
  platform: 'ANDROID' | 'IOS';
  appVersion?: string;
}

/**
 * Registro do aparelho para receber push.
 *
 * O token do FCM muda sozinho — o Android pode revoga-lo e emitir outro sem
 * aviso ao usuario. Por isso o registro e IDEMPOTENTE do lado do servidor e o
 * aplicativo pode reenviar sempre que quiser, sem se preocupar em ja ter
 * mandado antes.
 */
export function createPushTokensApi({ baseUrl }: { baseUrl: string }) {
  const withAuth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

  return {
    async register(accessToken: string, payload: RegisterDeviceTokenInput): Promise<{ ok: true }> {
      const response = await apiFetch(`${baseUrl}/driver/push-tokens`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<{ ok: true }>(response);
    },

    async unregister(accessToken: string, token: string): Promise<{ ok: true }> {
      const response = await apiFetch(`${baseUrl}/driver/push-tokens/${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ ok: true }>(response);
    },
  };
}
