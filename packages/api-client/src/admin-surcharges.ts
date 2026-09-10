import type { SurchargeItem } from '@motoboycity/types';
import type {
  UpsertSurchargePayload,
  SetSurchargeRainAutomationPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface AdminSurchargesApiConfig {
  baseUrl: string;
}

export function createAdminSurchargesApi({ baseUrl }: AdminSurchargesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function jsonHeaders(accessToken: string) {
    return { ...withAuth(accessToken), 'Content-Type': 'application/json' };
  }

  async function patch(accessToken: string, id: string, action: string): Promise<SurchargeItem> {
    const response = await apiFetch(`${baseUrl}/admin/surcharges/${id}/${action}`, {
      method: 'PATCH',
      headers: withAuth(accessToken),
    });
    return parseJsonOrThrow<SurchargeItem>(response);
  }

  return {
    /** Inclui o estado climático da taxa vinculada, sem consultar o provedor pelo navegador. */
    async list(accessToken: string): Promise<SurchargeItem[]> {
      const response = await apiFetch(`${baseUrl}/admin/surcharges`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<SurchargeItem[]>(response);
    },

    async create(accessToken: string, payload: UpsertSurchargePayload): Promise<SurchargeItem> {
      const response = await apiFetch(`${baseUrl}/admin/surcharges`, {
        method: 'POST',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<SurchargeItem>(response);
    },

    async update(
      accessToken: string,
      id: string,
      payload: UpsertSurchargePayload,
    ): Promise<SurchargeItem> {
      const response = await apiFetch(`${baseUrl}/admin/surcharges/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<SurchargeItem>(response);
    },

    /** Escolhe chuva automática ou manual/horários sem sobrescrever a taxa. */
    async setRainAutomation(
      accessToken: string,
      id: string,
      payload: SetSurchargeRainAutomationPayload,
    ): Promise<SurchargeItem> {
      const response = await apiFetch(`${baseUrl}/admin/surcharges/${id}/rain-automation`, {
        method: 'PATCH',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<SurchargeItem>(response);
    },

    turnOn: (accessToken: string, id: string) => patch(accessToken, id, 'turn-on'),
    turnOff: (accessToken: string, id: string) => patch(accessToken, id, 'turn-off'),
    activate: (accessToken: string, id: string) => patch(accessToken, id, 'activate'),
    deactivate: (accessToken: string, id: string) => patch(accessToken, id, 'deactivate'),

    async remove(accessToken: string, id: string): Promise<void> {
      const response = await apiFetch(`${baseUrl}/admin/surcharges/${id}`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      if (!response.ok) {
        await parseJsonOrThrow<unknown>(response);
      }
    },
  };
}
