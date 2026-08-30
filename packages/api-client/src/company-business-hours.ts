import type { CompanyBusinessHoursStatus } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export function createCompanyBusinessHoursApi({ baseUrl }: { baseUrl: string }) {
  return {
    async status(accessToken: string): Promise<CompanyBusinessHoursStatus> {
      const response = await apiFetch(`${baseUrl}/company/business-hours`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<CompanyBusinessHoursStatus>(response);
    },
  };
}
