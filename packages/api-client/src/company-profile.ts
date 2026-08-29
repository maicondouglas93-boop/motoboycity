import type { CompanyProfile } from '@motoboycity/types';
import type { UpdateCompanyProfilePayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyProfileApiConfig {
  baseUrl: string;
}

export function createCompanyProfileApi({ baseUrl }: CompanyProfileApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async get(accessToken: string): Promise<CompanyProfile> {
      const response = await apiFetch(`${baseUrl}/company/profile`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyProfile>(response);
    },

    async update(
      accessToken: string,
      payload: UpdateCompanyProfilePayload,
    ): Promise<CompanyProfile> {
      const response = await apiFetch(`${baseUrl}/company/profile`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CompanyProfile>(response);
    },
  };
}
