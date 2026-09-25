import type { PublicStoreLookup } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface PublicStoreApiConfig {
  baseUrl: string;
}

/** A loja online como o cliente a vê, sem login. Link que não existe responde 404. */
export function createPublicStoreApi({ baseUrl }: PublicStoreApiConfig) {
  return {
    async store(slug: string, init?: RequestInit): Promise<PublicStoreLookup> {
      const response = await apiFetch(
        `${baseUrl}/public/stores/${encodeURIComponent(slug)}`,
        init ?? {},
      );
      return parseJsonOrThrow<PublicStoreLookup>(response);
    },
  };
}
