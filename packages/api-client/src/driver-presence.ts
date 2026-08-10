import type { DriverAvailability, DriverPresenceItem } from '@motoboycity/types';
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

    async set(accessToken: string, availability: DriverAvailability): Promise<DriverPresenceItem> {
      const response = await fetch(`${baseUrl}/driver/presence`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability }),
      });
      return parseJsonOrThrow<DriverPresenceItem>(response);
    },
  };
}
