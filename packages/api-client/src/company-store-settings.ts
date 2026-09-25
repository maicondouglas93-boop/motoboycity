import type { StoreSettings } from '@motoboycity/types';
import type { UpdateStoreLinkPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreSettingsApiConfig {
  baseUrl: string;
}

/** O link e o nome da loja online, do lado do painel da empresa. */
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
  };
}
