import type { AcceptOfferResult } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DeliveryOffersApiConfig {
  baseUrl: string;
}

export function createDeliveryOffersApi({ baseUrl }: DeliveryOffersApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async accept(accessToken: string, offerId: string): Promise<AcceptOfferResult> {
      const response = await fetch(`${baseUrl}/delivery-offers/${offerId}/accept`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AcceptOfferResult>(response);
    },

    async decline(accessToken: string, offerId: string): Promise<{ ok: true }> {
      const response = await fetch(`${baseUrl}/delivery-offers/${offerId}/decline`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ ok: true }>(response);
    },
  };
}
