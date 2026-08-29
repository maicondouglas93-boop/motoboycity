import type { AdminRegion } from '@motoboycity/types';
import type { AdminRegionPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export function createAdminRegionsApi({ baseUrl }: { baseUrl: string }) {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  return {
    async list(token: string): Promise<AdminRegion[]> {
      return parseJsonOrThrow<AdminRegion[]>(
        await apiFetch(`${baseUrl}/admin/regions`, { headers: auth(token) }),
      );
    },
    async create(token: string, payload: AdminRegionPayload): Promise<AdminRegion> {
      return parseJsonOrThrow<AdminRegion>(
        await apiFetch(`${baseUrl}/admin/regions`, {
          method: 'POST',
          headers: { ...auth(token), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    async update(token: string, id: string, payload: AdminRegionPayload): Promise<AdminRegion> {
      return parseJsonOrThrow<AdminRegion>(
        await apiFetch(`${baseUrl}/admin/regions/${id}`, {
          method: 'PUT',
          headers: { ...auth(token), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    async setActive(token: string, id: string, active: boolean): Promise<AdminRegion> {
      return parseJsonOrThrow<AdminRegion>(
        await apiFetch(`${baseUrl}/admin/regions/${id}/${active ? 'reactivate' : 'deactivate'}`, {
          method: 'PATCH',
          headers: auth(token),
        }),
      );
    },
  };
}
