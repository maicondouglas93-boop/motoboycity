import type { ContaAsaasDaLoja } from '@motoboycity/types';
import type { StoreAsaasAccountPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreAsaasApiConfig {
  baseUrl: string;
}

/** A conta Asaas da loja, em Configurações. A chave vai; ela nunca volta. */
export function createCompanyStoreAsaasApi({ baseUrl }: CompanyStoreAsaasApiConfig) {
  const base = `${baseUrl}/company/store/asaas-account`;

  return {
    async conta(accessToken: string): Promise<ContaAsaasDaLoja> {
      const response = await apiFetch(base, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<ContaAsaasDaLoja>(response);
    },

    /** Recusado (400) se o Asaas não reconhecer a chave no ambiente escolhido. */
    async conectar(
      accessToken: string,
      payload: StoreAsaasAccountPayload,
    ): Promise<ContaAsaasDaLoja> {
      const response = await apiFetch(base, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<ContaAsaasDaLoja>(response);
    },

    async desconectar(accessToken: string): Promise<ContaAsaasDaLoja> {
      const response = await apiFetch(base, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<ContaAsaasDaLoja>(response);
    },
  };
}
