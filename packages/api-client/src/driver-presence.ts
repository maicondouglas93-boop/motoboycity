import type {
  DriverPresenceHeartbeatPayload,
  DriverPresenceItem,
  SetDriverPresencePayload,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DriverPresenceApiConfig {
  baseUrl: string;
}

export function createDriverPresenceApi({ baseUrl }: DriverPresenceApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async get(accessToken: string): Promise<DriverPresenceItem> {
      const response = await fetch(`${baseUrl}/driver/presence`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverPresenceItem>(response);
    },

    async set(
      accessToken: string,
      payload: SetDriverPresencePayload,
    ): Promise<DriverPresenceItem> {
      const response = await fetch(`${baseUrl}/driver/presence`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DriverPresenceItem>(response);
    },

    async heartbeat(
      accessToken: string,
      payload: DriverPresenceHeartbeatPayload,
    ): Promise<DriverPresenceItem> {
      const response = await fetch(`${baseUrl}/driver/presence/heartbeat`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DriverPresenceItem>(response);
    },
  };
}
