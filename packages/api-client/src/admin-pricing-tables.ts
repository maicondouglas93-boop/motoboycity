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
      filters?: { serviceTypeId?: string; active?: boolean },
    ): Promise<PricingTableItem[]> {
      const params = new URLSearchParams();
      if (filters?.serviceTypeId) params.set('serviceTypeId', filters.serviceTypeId);
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
        baseFee: number;
        perKmFee: number;
        minimumFee?: number;
        returnFee?: number;
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
  };
}
