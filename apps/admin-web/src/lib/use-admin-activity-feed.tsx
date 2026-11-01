'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { OperationalActivityEvent } from '@motoboycity/types';
import { io } from 'socket.io-client';
import { adminOperationsApi, baseUrl } from './api-client';
import { useAdminRegionFilter } from './region-filter';
import { session } from './session';

const MAX_EVENTS = 100;

interface AdminActivityFeedState {
  events: OperationalActivityEvent[];
  connected: boolean;
}

const AdminActivityFeedContext = createContext<AdminActivityFeedState | null>(null);

export function isDriverPresenceActivity(event: OperationalActivityEvent): boolean {
  return event.type === 'DRIVER_ONLINE' || event.type === 'DRIVER_OFFLINE';
}

/**
 * Mantem uma unica conexao de atividade para toda a area autenticada.
 *
 * A Home e o botao flutuante consomem o mesmo feed. Antes, cada consumidor
 * abria seu proprio Socket.IO e repetia a consulta inicial.
 */
export function AdminActivityFeedProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<OperationalActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const { regionId } = useAdminRegionFilter();
  const regionIdRef = useRef(regionId);

  useEffect(() => {
    regionIdRef.current = regionId;
  }, [regionId]);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    let cancelled = false;

    adminOperationsApi
      .activity(token, { limit: MAX_EVENTS, regionId: regionId || undefined })
      .then((history) => {
        if (!cancelled) setEvents(history);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [regionId]);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    let cancelled = false;

    const socket = io(baseUrl, { auth: { token } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('admin:activity', (event: OperationalActivityEvent) => {
      const activeRegionId = regionIdRef.current;
      if (!activeRegionId) {
        setEvents((current) =>
          [event, ...current.filter((item) => item.id !== event.id)].slice(0, MAX_EVENTS),
        );
        return;
      }

      if (event.regionId) {
        if (event.regionId !== activeRegionId) return;
        setEvents((current) =>
          [event, ...current.filter((item) => item.id !== event.id)].slice(0, MAX_EVENTS),
        );
        return;
      }

      adminOperationsApi
        .activity(token, { limit: MAX_EVENTS, regionId: activeRegionId })
        .then((history) => {
          if (!cancelled && regionIdRef.current === activeRegionId) {
            setEvents(history);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  const value = useMemo(() => ({ events, connected }), [connected, events]);

  return (
    <AdminActivityFeedContext.Provider value={value}>{children}</AdminActivityFeedContext.Provider>
  );
}

export function useAdminActivityFeed(): AdminActivityFeedState {
  const feed = useContext(AdminActivityFeedContext);
  if (!feed) {
    throw new Error('useAdminActivityFeed deve ser usado dentro de AdminActivityFeedProvider.');
  }
  return feed;
}
