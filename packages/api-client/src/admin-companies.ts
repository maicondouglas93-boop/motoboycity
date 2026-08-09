import type { AdminCompanyListItem, ApproveCompanyResult, CompanyStatus } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface AdminCompaniesApiConfig {
  baseUrl: string;
}

export function createAdminCompaniesApi({ baseUrl }: AdminCompaniesApiConfig) {
  return {
    async list(accessToken: string, status?: CompanyStatus): Promise<AdminCompanyListItem[]> {
      const query = status ? `?status=${status}` : '';
      const response = await fetch(`${baseUrl}/admin/companies${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<AdminCompanyListItem[]>(response);
    },

    async approve(accessToken: string, companyId: string): Promise<ApproveCompanyResult> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<ApproveCompanyResult>(response);
    },
  };
}
