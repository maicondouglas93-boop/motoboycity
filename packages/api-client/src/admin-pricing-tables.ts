import type { PricingTableItem } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface AdminPricingTablesApiConfig {
  baseUrl: string;
}

export function createAdminPricingTablesApi({ baseUrl }: AdminPricingTablesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(
      accessToken: string,
      filters?: { serviceTypeId?: string; companyId?: string; active?: boolean },
    ): Promise<PricingTableItem[]> {
      const params = new URLSearchParams();
      if (filters?.serviceTypeId) params.set('serviceTypeId', filters.serviceTypeId);
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.active !== undefined) params.set('active', String(filters.active));
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${baseUrl}/admin/pricing-tables${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PricingTableItem[]>(response);
    },

    async create(
      accessToken: string,
      payload: {
        serviceTypeId: string;
        companyId?: string;
        baseFee: number;
        includedDistanceKm?: number;
        perKmFee: number;
        minimumFee?: number;
        returnFee?: number;
        driverCommissionPercentage?: number;
      },
    ): Promise<PricingTableItem> {
      const response = await fetch(`${baseUrl}/admin/pricing-tables`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PricingTableItem>(response);
    },

    async deactivate(accessToken: string, id: string): Promise<PricingTableItem> {
      const response = await fetch(`${baseUrl}/admin/pricing-tables/${id}/deactivate`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PricingTableItem>(response);
    },

    /** Recusa com 409 se ja houver outra tabela ativa no mesmo escopo. */
    async reactivate(accessToken: string, id: string): Promise<PricingTableItem> {
      const response = await fetch(`${baseUrl}/admin/pricing-tables/${id}/reactivate`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PricingTableItem>(response);
    },
  };
}
