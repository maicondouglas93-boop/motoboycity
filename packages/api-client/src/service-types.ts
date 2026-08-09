import type { ServiceTypeItem } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface ServiceTypesApiConfig {
  baseUrl: string;
}

/** Catálogo de leitura (/service-types) — qualquer autenticado, não só admin. */
export function createServiceTypesApi({ baseUrl }: ServiceTypesApiConfig) {
  return {
    async list(accessToken: string, filters?: { active?: boolean }): Promise<ServiceTypeItem[]> {
      const params = new URLSearchParams();
      if (filters?.active !== undefined) params.set('active', String(filters.active));
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${baseUrl}/service-types${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<ServiceTypeItem[]>(response);
    },
  };
}
