import type {
  ActiveDeliveryTrackingItem,
  DeliveryTrackingDetail,
  DeliveryTrackingPoint,
  PublicDeliveryTracking,
  PublicDeliveryTrackingLink,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface TrackingApiConfig {
  baseUrl: string;
}

export function createTrackingApi({ baseUrl }: TrackingApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async reportLocation(
      accessToken: string,
      deliveryId: string,
      payload: { lat: number; lng: number; accuracy?: number },
    ): Promise<DeliveryTrackingPoint> {
      const response = await apiFetch(`${baseUrl}/tracking/driver/deliveries/${deliveryId}/points`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DeliveryTrackingPoint>(response);
    },

    async detail(
      accessToken: string,
      deliveryId: string,
      filters?: { from?: string; to?: string; limit?: number },
    ): Promise<DeliveryTrackingDetail> {
      const params = new URLSearchParams();
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(`${baseUrl}/tracking/deliveries/${deliveryId}${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DeliveryTrackingDetail>(response);
    },

    async active(accessToken: string): Promise<ActiveDeliveryTrackingItem[]> {
      const response = await apiFetch(`${baseUrl}/tracking/active`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<ActiveDeliveryTrackingItem[]>(response);
    },

    async issuePublicLink(
      accessToken: string,
      deliveryId: string,
    ): Promise<PublicDeliveryTrackingLink> {
      const response = await apiFetch(`${baseUrl}/tracking/deliveries/${deliveryId}/public-link`, {
        method: 'POST',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PublicDeliveryTrackingLink>(response);
    },

    async revokePublicLink(accessToken: string, deliveryId: string): Promise<{ revoked: true }> {
      const response = await apiFetch(`${baseUrl}/tracking/deliveries/${deliveryId}/public-link`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ revoked: true }>(response);
    },

    async publicDetail(token: string): Promise<PublicDeliveryTracking> {
      const response = await apiFetch(`${baseUrl}/public/tracking/${encodeURIComponent(token)}`);
      return parseJsonOrThrow<PublicDeliveryTracking>(response);
    },
  };
}
