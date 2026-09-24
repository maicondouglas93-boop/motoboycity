import type {
  PageProtectionStatusItem,
  SetPageProtectionPayload,
  UpdatePageProtectionPayload,
  VerifyPagePasswordPayload,
  VerifyPagePasswordResult,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyPageProtectionApiConfig {
  baseUrl: string;
}

export function createCompanyPageProtectionApi({ baseUrl }: CompanyPageProtectionApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(accessToken: string): Promise<PageProtectionStatusItem[]> {
      const response = await apiFetch(`${baseUrl}/company/page-protection`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PageProtectionStatusItem[]>(response);
    },

    async setProtection(
      accessToken: string,
      payload: SetPageProtectionPayload,
    ): Promise<PageProtectionStatusItem> {
      const response = await apiFetch(`${baseUrl}/company/page-protection`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PageProtectionStatusItem>(response);
    },

    async updateProtection(
      accessToken: string,
      routeKey: string,
      payload: UpdatePageProtectionPayload,
    ): Promise<PageProtectionStatusItem> {
      const response = await apiFetch(`${baseUrl}/company/page-protection/${routeKey}`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PageProtectionStatusItem>(response);
    },

    async verifyPassword(
      accessToken: string,
      payload: VerifyPagePasswordPayload,
    ): Promise<VerifyPagePasswordResult> {
      const response = await apiFetch(`${baseUrl}/company/page-protection/verify`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<VerifyPagePasswordResult>(response);
    },
  };
}
