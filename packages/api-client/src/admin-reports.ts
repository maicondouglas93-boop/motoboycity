import type { AdminOperationsReport } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface AdminReportsApiConfig {
  baseUrl: string;
}

export function createAdminReportsApi({ baseUrl }: AdminReportsApiConfig) {
  return {
    async operations(
      accessToken: string,
      filters?: { from?: string; to?: string },
    ): Promise<AdminOperationsReport> {
      const params = new URLSearchParams();
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/reports/operations${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<AdminOperationsReport>(response);
    },
  };
}
