import type { AdminOrderReportResult, DeliveryDetail } from '@motoboycity/types';
import type {
  AdminOrderReportQuery,
  CreateDeliveryPayload,
  ForceCompletePayload,
  AdminMarkFailedPayload,
  ManualDeliveryStagePayload,
  ReassignDriverPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface AdminDeliveriesApiConfig {
  baseUrl: string;
}

/** Intervencoes manuais do admin sobre um pedido. */
export function createAdminDeliveriesApi({ baseUrl }: AdminDeliveriesApiConfig) {
  function jsonHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  }

  async function patch(
    accessToken: string,
    id: string,
    action: string,
    payload: unknown,
  ): Promise<DeliveryDetail> {
    const response = await apiFetch(`${baseUrl}/admin/deliveries/${id}/${action}`, {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<DeliveryDetail>(response);
  }

  return {
    async report(
      accessToken: string,
      filters: Partial<AdminOrderReportQuery> = {},
    ): Promise<AdminOrderReportResult> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const response = await apiFetch(`${baseUrl}/admin/deliveries/report?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<AdminOrderReportResult>(response);
    },
    async createForCompany(
      accessToken: string,
      companyId: string,
      payload: CreateDeliveryPayload,
    ): Promise<DeliveryDetail> {
      const response = await apiFetch(`${baseUrl}/admin/deliveries/company/${companyId}`, {
        method: 'POST',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },
    async updateBeforeAcceptance(
      accessToken: string,
      id: string,
      payload: CreateDeliveryPayload,
    ): Promise<DeliveryDetail> {
      const response = await apiFetch(`${baseUrl}/admin/deliveries/${id}`, {
        method: 'PUT',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryDetail>(response);
    },
    reassignDriver: (accessToken: string, id: string, payload: ReassignDriverPayload) =>
      patch(accessToken, id, 'driver', payload),
    markCollected: (accessToken: string, id: string, payload: ManualDeliveryStagePayload) =>
      patch(accessToken, id, 'collect', payload),
    markDelivered: (accessToken: string, id: string, payload: ManualDeliveryStagePayload) =>
      patch(accessToken, id, 'deliver', payload),
    markFailed: (accessToken: string, id: string, payload: AdminMarkFailedPayload) =>
      patch(accessToken, id, 'fail', payload),

    forceComplete: (accessToken: string, id: string, payload: ForceCompletePayload) =>
      patch(accessToken, id, 'force-complete', payload),
  };
}
