'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { ActiveDeliveryTrackingItem, DeliveryTrackingPoint } from '@motoboycity/types';
import { trackingApi } from './api-client';
import { session } from './session';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
type LocationEvent = DeliveryTrackingPoint & { deliveryId: string; driverId: string };

export function useCompanyActiveDeliveryTracking() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['company', 'tracking', 'active'],
    queryFn: () => trackingApi.active(token as string),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(baseUrl, { auth: { token } });
    socket.on('delivery:location', (point: LocationEvent) => {
      queryClient.setQueryData<ActiveDeliveryTrackingItem[]>(
        ['company', 'tracking', 'active'],
        (items) =>
          items?.map((item) =>
            item.deliveryId === point.deliveryId ? { ...item, lastLocation: point } : item,
          ),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token]);

  return query;
}
