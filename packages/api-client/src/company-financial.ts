import type {
  CompanyFinancialPosition,
  CompanyFinancialSummary,
  CompanyUnbilledDeliveries,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyFinancialApiConfig {
  baseUrl: string;
}

/**
 * Financeiro visto pela loja.
 *
 * Nenhum metodo aceita `companyId`: a empresa vem do token, e e o servidor que
 * decide de quem sao os numeros.
 */
export function createCompanyFinancialApi({ baseUrl }: CompanyFinancialApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async position(accessToken: string): Promise<CompanyFinancialPosition> {
      const response = await apiFetch(`${baseUrl}/company/financial/position`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyFinancialPosition>(response);
    },

    async unbilled(accessToken: string): Promise<CompanyUnbilledDeliveries> {
      const response = await apiFetch(`${baseUrl}/company/financial/unbilled`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyUnbilledDeliveries>(response);
    },

    async summary(
      accessToken: string,
      periodo: { from: string; to: string },
    ): Promise<CompanyFinancialSummary> {
      const query = new URLSearchParams(periodo);
      const response = await apiFetch(`${baseUrl}/company/financial/summary?${query.toString()}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyFinancialSummary>(response);
    },

    /**
     * Devolve o CSV como texto, ja montado pelo servidor.
     *
     * Nao passa por `parseJsonOrThrow` no caminho feliz: a resposta de sucesso
     * nao e JSON. No erro ela e, e ai o parse vale para reaproveitar a mesma
     * `ApiError` do resto do cliente.
     */
    async exportCsv(
      accessToken: string,
      periodo: { from: string; to: string },
    ): Promise<string> {
      const query = new URLSearchParams(periodo);
      const response = await apiFetch(`${baseUrl}/company/financial/export?${query.toString()}`, {
        headers: withAuth(accessToken),
      });
      if (!response.ok) {
        await parseJsonOrThrow<never>(response);
      }
      return response.text();
    },
  };
}
