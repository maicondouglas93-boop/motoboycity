import type {
  AdminDeliveryDispatchAudit,
  AdminOperationsResult,
  DeliveryStatus,
  OperationalActivityEvent,
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
  };
}
