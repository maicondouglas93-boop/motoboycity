'use client';

import { useEffect, useState } from 'react';
import type { OperationalActivityEvent } from '@motoboycity/types';
import { io } from 'socket.io-client';
import { adminOperationsApi, baseUrl } from './api-client';
import { session } from './session';

const MAX_EVENTS = 40;

export function useAdminActivityFeed() {
  const [events, setEvents] = useState<OperationalActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    let cancelled = false;
    adminOperationsApi
      .activity(token, { limit: 30 })
      .then((history) => {
        if (!cancelled) setEvents(history);
      })
      .catch(() => undefined);

    const socket = io(baseUrl, { auth: { token } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('admin:activity', (event: OperationalActivityEvent) => {
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, MAX_EVENTS));
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  return { events, connected };
}
