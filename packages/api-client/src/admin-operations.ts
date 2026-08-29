import type {
  AdminDeliveryDispatchAudit,
  AdminDispatchQueueResult,
  AdminOperationsResult,
  AdminTargetedDispatchResult,
  DeliveryStatus,
  OperationalActivityEvent,
  SilentDriverItem,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export function createAdminOperationsApi({ baseUrl }: { baseUrl: string }) {
  const withAuth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

  return {
    async overview(
      accessToken: string,
      filters?: { q?: string; statuses?: DeliveryStatus[]; companyId?: string; driverId?: string },
    ): Promise<AdminOperationsResult> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.statuses?.length) params.set('statuses', filters.statuses.join(','));
      if (filters?.companyId) params.set('companyId', filters.companyId);
      if (filters?.driverId) params.set('driverId', filters.driverId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/operations${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminOperationsResult>(response);
    },

    async activity(
      accessToken: string,
      filters?: { limit?: number; before?: string },
    ): Promise<OperationalActivityEvent[]> {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.before) params.set('before', filters.before);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/operations/activity${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<OperationalActivityEvent[]>(response);
    },

    /**
     * Quem esta com pedido em andamento e sem posicao agora.
     *
     * O painel le o ESTADO, e nao o log de avisos: quem ja foi avisado continua
     * aparecendo enquanto o silencio durar.
     */
    async silentDrivers(accessToken: string): Promise<SilentDriverItem[]> {
      const response = await fetch(`${baseUrl}/admin/operations/silent-drivers`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<SilentDriverItem[]>(response);
    },

    async dispatchAudit(
      accessToken: string,
      deliveryId: string,
    ): Promise<AdminDeliveryDispatchAudit> {
      const response = await fetch(
        `${baseUrl}/admin/operations/deliveries/${deliveryId}/dispatch-audit`,
        { headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<AdminDeliveryDispatchAudit>(response);
    },

    async reorderDispatchQueue(
      accessToken: string,
      payload: { driverIds: string[] },
    ): Promise<AdminDispatchQueueResult> {
      const response = await fetch(`${baseUrl}/admin/operations/dispatch-queue`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminDispatchQueueResult>(response);
    },

    async reofferDelivery(
      accessToken: string,
      deliveryId: string,
      payload: { driverId: string; reason: string },
    ): Promise<AdminTargetedDispatchResult> {
      const response = await fetch(
        `${baseUrl}/admin/operations/deliveries/${deliveryId}/reoffer`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminTargetedDispatchResult>(response);
    },
  };
}
