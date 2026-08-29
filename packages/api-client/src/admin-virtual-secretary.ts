import type {
  VirtualSecretaryChatPayload,
  VirtualSecretaryChatResult,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface AdminVirtualSecretaryApiConfig {
  baseUrl: string;
}

export function createAdminVirtualSecretaryApi({ baseUrl }: AdminVirtualSecretaryApiConfig) {
  return {
    async chat(
      accessToken: string,
      payload: VirtualSecretaryChatPayload,
    ): Promise<VirtualSecretaryChatResult> {
      const response = await apiFetch(`${baseUrl}/admin/virtual-secretary/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<VirtualSecretaryChatResult>(response);
    },
  };
}
