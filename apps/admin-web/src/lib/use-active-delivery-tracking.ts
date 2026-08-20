'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { ActiveDeliveryTrackingItem, DeliveryTrackingPoint } from '@motoboycity/types';
import { baseUrl, trackingApi } from './api-client';
import { session } from './session';

type LocationEvent = DeliveryTrackingPoint & { deliveryId: string; driverId: string };

export function useAdminActiveDeliveryTracking() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'tracking', 'active'],
    queryFn: () => trackingApi.active(token as string),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(baseUrl, { auth: { token } });
    socket.on('delivery:location', (point: LocationEvent) => {
      queryClient.setQueryData<ActiveDeliveryTrackingItem[]>(
        ['admin', 'tracking', 'active'],
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
