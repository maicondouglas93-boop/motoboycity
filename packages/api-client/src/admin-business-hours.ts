import type { BusinessHoursResult } from '@motoboycity/types';
import type { ReplaceBusinessHoursPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export interface AdminBusinessHoursApiConfig {
  baseUrl: string;
}

export function createAdminBusinessHoursApi({ baseUrl }: AdminBusinessHoursApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async get(accessToken: string): Promise<BusinessHoursResult> {
      const response = await fetch(`${baseUrl}/admin/business-hours`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<BusinessHoursResult>(response);
    },

    /** Substitui o conjunto inteiro de faixas. */
    async replace(
      accessToken: string,
      payload: ReplaceBusinessHoursPayload,
    ): Promise<BusinessHoursResult> {
      const response = await fetch(`${baseUrl}/admin/business-hours`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<BusinessHoursResult>(response);
    },
  };
}
