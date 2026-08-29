import type { ServiceTypeItem } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface AdminServiceTypesApiConfig {
  baseUrl: string;
}

export function createAdminServiceTypesApi({ baseUrl }: AdminServiceTypesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(accessToken: string, filters?: { active?: boolean }): Promise<ServiceTypeItem[]> {
      const params = new URLSearchParams();
      if (filters?.active !== undefined) params.set('active', String(filters.active));
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await apiFetch(`${baseUrl}/admin/service-types${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<ServiceTypeItem[]>(response);
    },

    async create(
      accessToken: string,
      payload: { code: string; name: string },
    ): Promise<ServiceTypeItem> {
      const response = await apiFetch(`${baseUrl}/admin/service-types`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<ServiceTypeItem>(response);
    },

    async update(
      accessToken: string,
      id: string,
      payload: { name?: string; active?: boolean },
    ): Promise<ServiceTypeItem> {
      const response = await apiFetch(`${baseUrl}/admin/service-types/${id}`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<ServiceTypeItem>(response);
    },
  };
}
