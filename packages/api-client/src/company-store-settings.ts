import type { StoreSettings } from '@motoboycity/types';
import type {
  StoreAcceptsOrdersPayload,
  UpdateStoreIdentityPayload,
  UpdateStoreLinkPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreSettingsApiConfig {
  baseUrl: string;
}

/** O link, o nome e a identidade visual da loja online, do lado do painel da empresa. */
export function createCompanyStoreSettingsApi({ baseUrl }: CompanyStoreSettingsApiConfig) {
  return {
    async settings(accessToken: string): Promise<StoreSettings> {
      const response = await apiFetch(`${baseUrl}/company/store/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },

    /** Recusado (409) se o link já é, ou já foi, de outra loja. */
    async updateLink(accessToken: string, payload: UpdateStoreLinkPayload): Promise<StoreSettings> {
      const response = await apiFetch(`${baseUrl}/company/store/settings/link`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },

    /**
     * O tema e as duas cores. Recusado (400) se uma cor não se separa do fundo,
     * e (409) antes de a loja ter link — é por ele que ela existe.
     */
    async updateIdentity(
      accessToken: string,
      payload: UpdateStoreIdentityPayload,
    ): Promise<StoreSettings> {
      const response = await apiFetch(`${baseUrl}/company/store/settings/identity`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },

    /** Liga ou desliga os pedidos pela página. Recusado (409) antes de a loja ter link. */
    async updateAcceptsOrders(
      accessToken: string,
      payload: StoreAcceptsOrdersPayload,
    ): Promise<StoreSettings> {
      const response = await apiFetch(`${baseUrl}/company/store/settings/accepts-orders`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },

    /** A logo vai por arquivo (campo `file`); o servidor a guarda no ImageKit. */
    async uploadLogo(accessToken: string, logo: Blob): Promise<StoreSettings> {
      const corpo = new FormData();
      corpo.append('file', logo);
      const response = await apiFetch(`${baseUrl}/company/store/settings/logo`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: corpo,
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },

    async removeLogo(accessToken: string): Promise<StoreSettings> {
      const response = await apiFetch(`${baseUrl}/company/store/settings/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<StoreSettings>(response);
    },
  };
}
