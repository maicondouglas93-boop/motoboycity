import type { DriverScheduleView } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface DriverScheduleApiConfig {
  baseUrl: string;
}

/** A escala do proprio motoboy. So leitura: quem monta e a central, no ADM. */
export function createDriverScheduleApi({ baseUrl }: DriverScheduleApiConfig) {
  return {
    async get(accessToken: string): Promise<DriverScheduleView> {
      const response = await apiFetch(`${baseUrl}/driver/schedule`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<DriverScheduleView>(response);
    },
  };
}
