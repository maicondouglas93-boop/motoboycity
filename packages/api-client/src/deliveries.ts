import type { CreateDeliveryPayload, DeliveryDetail, DeliveryListItem, DeliveryStatus } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DeliveriesApiConfig {
  baseUrl: string;
}

export function createDeliveriesApi({ baseUrl }: DeliveriesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(accessToken: string, filters?: { status?: DeliveryStatus }): Promise<DeliveryListItem[]> {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${baseUrl}/deliveries${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryListItem[]>(response);
    },

    async detail(accessToken: string, id: string): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    async create(accessToken: string, payload: CreateDeliveryPayload): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    async cancel(accessToken: string, id: string): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/cancel`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },
  };
}
