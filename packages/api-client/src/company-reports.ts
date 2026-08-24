import type { CompanyOperationsReport } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface CompanyReportsApiConfig {
  baseUrl: string;
}

/** Relatórios sempre resolvem a empresa pelo token, nunca por parâmetro. */
export function createCompanyReportsApi({ baseUrl }: CompanyReportsApiConfig) {
  return {
    async operations(
      accessToken: string,
      period: { from: string; to: string },
    ): Promise<CompanyOperationsReport> {
      const query = new URLSearchParams(period);
      const response = await fetch(`${baseUrl}/company/reports/operations?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<CompanyOperationsReport>(response);
    },
  };
}
