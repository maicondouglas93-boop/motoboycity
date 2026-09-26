import type { PedidoDaLoja } from '@motoboycity/types';
import type { StoreOrderCancelPayload, StoreOrderStagePayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreOrdersApiConfig {
  baseUrl: string;
}

/** Os pedidos da loja online, do lado do painel: a fila de Vendas e as ações. */
export function createCompanyStoreOrdersApi({ baseUrl }: CompanyStoreOrdersApiConfig) {
  const base = `${baseUrl}/company/store/orders`;

  async function enviar(accessToken: string, caminho: string, method: string, corpo?: unknown) {
    const response = await apiFetch(`${base}${caminho}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return parseJsonOrThrow<PedidoDaLoja>(response);
  }

  return {
    async vendas(accessToken: string): Promise<PedidoDaLoja[]> {
      const response = await apiFetch(base, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<PedidoDaLoja[]>(response);
    },

    /** Recusado (409) se o pedido já mudou de etapa por outra aba. */
    avancar(accessToken: string, id: string, payload: StoreOrderStagePayload) {
      return enviar(accessToken, `/${id}/stage`, 'PUT', payload);
    },

    cancelar(accessToken: string, id: string, payload: StoreOrderCancelPayload) {
      return enviar(accessToken, `/${id}/cancel`, 'POST', payload);
    },

    chamarMotoboyCity(accessToken: string, id: string) {
      return enviar(accessToken, `/${id}/call-motoboycity`, 'POST');
    },
  };
}
