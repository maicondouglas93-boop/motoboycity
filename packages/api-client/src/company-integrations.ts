import type {
  AiqfomeConnectResult,
  AiqfomeDisconnectResult,
  CompanyAiqfomeIntegration,
  UpdateAiqfomeSettingsInput,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface CompanyIntegrationsApiConfig {
  baseUrl: string;
}

export function createCompanyIntegrationsApi({ baseUrl }: CompanyIntegrationsApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async getAiqfome(accessToken: string): Promise<CompanyAiqfomeIntegration> {
      const response = await fetch(`${baseUrl}/company/integrations/aiqfome`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyAiqfomeIntegration>(response);
    },

    async connectAiqfome(accessToken: string): Promise<AiqfomeConnectResult> {
      const response = await fetch(`${baseUrl}/company/integrations/aiqfome/connect`, {
        method: 'POST',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AiqfomeConnectResult>(response);
    },

    async disconnectAiqfome(accessToken: string): Promise<AiqfomeDisconnectResult> {
      const response = await fetch(`${baseUrl}/company/integrations/aiqfome/disconnect`, {
        method: 'POST',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AiqfomeDisconnectResult>(response);
    },

    async updateAiqfomeSettings(
      accessToken: string,
      payload: UpdateAiqfomeSettingsInput,
    ): Promise<CompanyAiqfomeIntegration> {
      const response = await fetch(`${baseUrl}/company/integrations/aiqfome/settings`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CompanyAiqfomeIntegration>(response);
    },
  };
}
