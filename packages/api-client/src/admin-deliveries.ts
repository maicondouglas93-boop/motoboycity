import type { DeliveryDetail } from '@motoboycity/types';
import type { ForceCompletePayload, ReassignDriverPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

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
    const response = await fetch(`${baseUrl}/admin/deliveries/${id}/${action}`, {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<DeliveryDetail>(response);
  }

  return {
    reassignDriver: (accessToken: string, id: string, payload: ReassignDriverPayload) =>
      patch(accessToken, id, 'driver', payload),
    forceComplete: (accessToken: string, id: string, payload: ForceCompletePayload) =>
      patch(accessToken, id, 'force-complete', payload),
  };
}
