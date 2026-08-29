import type { NotificationsResult } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface NotificationsApiConfig {
  baseUrl: string;
}

export function createNotificationsApi({ baseUrl }: NotificationsApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    /** Avisos da empresa do usuário logado — o escopo vem do token. */
    async forCompany(accessToken: string): Promise<NotificationsResult> {
      const response = await apiFetch(`${baseUrl}/company/notifications`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<NotificationsResult>(response);
    },

    async forAdmin(accessToken: string): Promise<NotificationsResult> {
      const response = await apiFetch(`${baseUrl}/admin/notifications`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<NotificationsResult>(response);
    },
  };
}
