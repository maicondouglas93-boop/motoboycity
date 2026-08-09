import type { PlatformSettingsItem } from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface AdminPlatformSettingsApiConfig {
  baseUrl: string;
}

export function createAdminPlatformSettingsApi({ baseUrl }: AdminPlatformSettingsApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async get(accessToken: string): Promise<PlatformSettingsItem> {
      const response = await fetch(`${baseUrl}/admin/platform-settings`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PlatformSettingsItem>(response);
    },

    async update(
      accessToken: string,
      payload: { driverCommissionPercentage: number },
    ): Promise<PlatformSettingsItem> {
      const response = await fetch(`${baseUrl}/admin/platform-settings`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PlatformSettingsItem>(response);
    },
  };
}
