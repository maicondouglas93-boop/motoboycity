import type {
  CompleteReturnPayload,
  CreateDeliveryBatchPayload,
  CreateDeliveryPayload,
  DeliveryBatchDetail,
  DeliveryDetail,
  DeliveryGroupResult,
  DeliveryListItem,
  DeliveryOperationsResult,
  DeliveryStageTimesResult,
  DeliverySearchResult,
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
    async stageTimes(
      accessToken: string,
      filters?: {
        from?: string;
        to?: string;
        companyId?: string;
        driverId?: string;
        excludeRetroactive?: boolean;
      },
    ): Promise<DeliveryStageTimesResult> {
      const params = new URLSearchParams();
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.driverId) params.set('driverId', filters.driverId);
      if (filters?.excludeRetroactive !== undefined) {
        params.set('excludeRetroactive', String(filters.excludeRetroactive));
      }
      const query = params.toString();

      const response = await fetch(`${baseUrl}/deliveries/stage-times${query ? `?${query}` : ''}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryStageTimesResult>(response);
    },

    async operations(
      accessToken: string,
      filters?: {
        q?: string;
        statuses?: DeliveryStatus[];
        companyId?: string;
        driverId?: string;
        batchId?: string;
        deliveryId?: string;
      },
    ): Promise<DeliveryOperationsResult> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.statuses?.length) params.set('statuses', filters.statuses.join(','));
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.driverId) params.set('driverId', filters.driverId);
      if (filters?.batchId) params.set('batchId', filters.batchId);
      if (filters?.deliveryId) params.set('deliveryId', filters.deliveryId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/deliveries/operations${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryOperationsResult>(response);
    },

    async search(
      accessToken: string,
      filters?: {
        q?: string;
        status?: DeliveryStatus;
        driverId?: string;
        companyId?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
      },
    ): Promise<DeliverySearchResult> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.driverId) params.set('driverId', filters.driverId);
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/deliveries/search${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliverySearchResult>(response);
    },

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

    async group(accessToken: string, id: string): Promise<DeliveryGroupResult> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/group`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryGroupResult>(response);
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

    /**
     * `reason` e opcional e vira a nota do historico do pedido.
     *
     * A loja pode cancelar sem preencher nada. Admin e motoboy podem enviar
     * uma nota curta para deixar o contexto no historico.
     */
    async cancel(accessToken: string, id: string, reason?: string): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/cancel`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    async redispatch(accessToken: string, id: string): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/redispatch`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },

    /**
     * `occurredAt` so aparece quando o motoboy esqueceu de tocar na hora e esta
     * informando o horario. Sem ele, nao manda corpo nenhum — e o caminho da
     * esmagadora maioria das coletas.
     */
    async collect(
      accessToken: string,
      id: string,
      payload?: { occurredAt: string },
    ): Promise<DeliveryGroupResult> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/collect`, {
        method: 'PATCH',
        headers: payload
          ? { ...withAuth(accessToken), 'Content-Type': 'application/json' }
          : withAuth(accessToken),
        ...(payload && { body: JSON.stringify(payload) }),
      });
      return parseJsonOrThrow<DeliveryGroupResult>(response);
    },

    /**
     * Devolve a fila um pedido aceito. So vale antes da coleta — depois dela a
     * mercadoria esta com o motoboy e o caminho e `fail`.
     */
    async returnToQueue(
      accessToken: string,
      id: string,
      payload: { reason: string },
    ): Promise<{ deliveryId: string; displayNumber: number; returnedCount: number }> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/return-to-queue`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<{
        deliveryId: string;
        displayNumber: number;
        returnedCount: number;
      }>(response);
    },

    async fail(
      accessToken: string,
      id: string,
      payload: {
        reason: 'RECIPIENT_ABSENT' | 'ADDRESS_NOT_FOUND' | 'RECIPIENT_REFUSED' | 'OTHER';
        note?: string;
        lat?: number;
        lng?: number;
        accuracy?: number;
      },
    ): Promise<DeliveryDetail> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/fail`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
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
      payload?: CompleteReturnPayload,
    ): Promise<DeliveryGroupResult> {
      const response = await fetch(`${baseUrl}/deliveries/${id}/complete-return`, {
        method: 'PATCH',
        headers: payload
          ? { ...withAuth(accessToken), 'Content-Type': 'application/json' }
          : withAuth(accessToken),
        ...(payload && { body: JSON.stringify(payload) }),
      });
      return parseJsonOrThrow<DeliveryGroupResult>(response);
    },
  };
}
