import type { AdministrativeAuditEvent } from '@motoboycity/types';
import type { AdministrativeAuditQuery } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export function createAdminAuditApi({ baseUrl }: { baseUrl: string }) {
  return {
    async list(
      accessToken: string,
      query: Partial<AdministrativeAuditQuery> = {},
    ): Promise<AdministrativeAuditEvent[]> {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== '') params.set(key, String(value));
      });
      const suffix = params.size ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/audit${suffix}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<AdministrativeAuditEvent[]>(response);
    },
  };
}
