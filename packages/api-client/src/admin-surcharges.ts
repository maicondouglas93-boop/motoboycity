import type { SurchargeItem } from '@motoboycity/types';
import type { UpsertSurchargePayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

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
    const response = await fetch(`${baseUrl}/admin/surcharges/${id}/${action}`, {
      method: 'PATCH',
      headers: withAuth(accessToken),
    });
    return parseJsonOrThrow<SurchargeItem>(response);
  }

  return {
    async list(accessToken: string): Promise<SurchargeItem[]> {
      const response = await fetch(`${baseUrl}/admin/surcharges`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<SurchargeItem[]>(response);
    },

    async create(accessToken: string, payload: UpsertSurchargePayload): Promise<SurchargeItem> {
      const response = await fetch(`${baseUrl}/admin/surcharges`, {
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
      const response = await fetch(`${baseUrl}/admin/surcharges/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<SurchargeItem>(response);
    },

    /** O interruptor manual — o que o admin liga quando começa a chover. */
    turnOn: (accessToken: string, id: string) => patch(accessToken, id, 'turn-on'),
    turnOff: (accessToken: string, id: string) => patch(accessToken, id, 'turn-off'),
    activate: (accessToken: string, id: string) => patch(accessToken, id, 'activate'),
    deactivate: (accessToken: string, id: string) => patch(accessToken, id, 'deactivate'),

    async remove(accessToken: string, id: string): Promise<void> {
      const response = await fetch(`${baseUrl}/admin/surcharges/${id}`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      if (!response.ok) {
        await parseJsonOrThrow<unknown>(response);
      }
    },
  };
}
