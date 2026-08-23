import type {
  AcceptOfferResult,
  AvailableDeliveryItem,
  DeliveryOfferPayload,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DeliveryOffersApiConfig {
  baseUrl: string;
}

export function createDeliveryOffersApi({ baseUrl }: DeliveryOffersApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    /** Pedidos que ninguem aceitou e ficaram sem oferta pendente. */
    async listAvailable(accessToken: string): Promise<AvailableDeliveryItem[]> {
      const response = await fetch(`${baseUrl}/delivery-offers/available`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AvailableDeliveryItem[]>(response);
    },

    /**
     * A oferta esperando resposta agora. `null` quando nao ha nenhuma.
     *
     * Chamado ao abrir o aplicativo: a oferta pode ter chegado com ele fechado,
     * e ai o socket nao estava la para receber.
     */
    async pending(accessToken: string): Promise<DeliveryOfferPayload | null> {
      const response = await fetch(`${baseUrl}/delivery-offers/pending`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryOfferPayload | null>(response);
    },

    async claim(accessToken: string, deliveryId: string): Promise<AcceptOfferResult> {
      const response = await fetch(`${baseUrl}/delivery-offers/available/${deliveryId}/claim`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AcceptOfferResult>(response);
    },

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
