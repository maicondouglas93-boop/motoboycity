import type { CompanyAddressItem, UpsertCompanyAddressPayload } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface CompanyAddressApiConfig {
  baseUrl: string;
}

export function createCompanyAddressApi({ baseUrl }: CompanyAddressApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async get(accessToken: string): Promise<{ address: CompanyAddressItem | null }> {
      const response = await fetch(`${baseUrl}/company/address`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ address: CompanyAddressItem | null }>(response);
    },

    async upsert(
      accessToken: string,
      payload: UpsertCompanyAddressPayload,
    ): Promise<{ address: CompanyAddressItem }> {
      const response = await fetch(`${baseUrl}/company/address`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<{ address: CompanyAddressItem }>(response);
    },
  };
}
