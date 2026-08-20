import type {
  CompleteReturnPayload,
  CreateDeliveryBatchPayload,
  CreateDeliveryPayload,
  DeliveryBatchDetail,
  DeliveryDetail,
  DeliveryGroupResult,
  DeliveryListItem,
  DeliveryStatus,
  MarkDeliveredPayload,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DeliveriesApiConfig {
  baseUrl: string;
}

export function createDeliveriesApi({ baseUrl }: DeliveriesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(
      accessToken: string,
      filters?: {
        status?: DeliveryStatus;
        driverId?: string;
        companyId?: string;
        from?: string;
        to?: string;
      },
    ): Promise<DeliveryListItem[]> {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.driverId) params.set('driverId', filters.driverId);
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
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

    async createBatch(
      accessToken: string,
      payload: CreateDeliveryBatchPayload,
    ): Promise<DeliveryBatchDetail> {
      const response = await fetch(`${baseUrl}/deliveries/batch`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryBatchDetail>(response);
    },

    async cancel(accessToken: string, id: string): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/cancel`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    async collect(accessToken: string, id: string): Promise<DeliveryGroupResult> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/collect`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryGroupResult>(response);
    },

    async deliver(
      accessToken: string,
      id: string,
      payload: MarkDeliveredPayload,
    ): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/deliver`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    async completeReturn(
      accessToken: string,
      id: string,
      payload: CompleteReturnPayload,
    ): Promise<DeliveryGroupResult> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/complete-return`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryGroupResult>(response);
    },
  };
}
