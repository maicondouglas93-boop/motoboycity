'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { baseUrl } from './api-client';
import { session } from './session';

export interface ActivityEvent {
  id: string;
  message: string;
  at: string;
}

const MAX_EVENTS = 20;

/**
 * Conecta ao RealtimeGateway (sala "admin") e mantém uma lista rolante dos
 * últimos eventos de admin:activity. Um hook por widget é suficiente aqui —
 * só um lugar no admin-web consome isso hoje (LiveActivityWidget).
 */
export function useAdminActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;

    const socket = io(baseUrl, { auth: { token } });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('admin:activity', (payload: { message: string; at: string }) => {
      setEvents((current) =>
        [{ id: crypto.randomUUID(), message: payload.message, at: payload.at }, ...current].slice(
          0,
          MAX_EVENTS,
        ),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { events, connected };
}
