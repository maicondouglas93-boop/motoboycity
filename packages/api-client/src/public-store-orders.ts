import type { PedidoDaLoja } from '@motoboycity/types';
import type { StoreCheckoutPayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';
import { semCorpoOuErro, type InscricaoDoNavegador } from './web-push';

export interface PublicStoreOrdersApiConfig {
  baseUrl: string;
}

/**
 * O pedido na página da loja, do lado do cliente. O token é o do login do
 * cliente (Firebase), e não o do painel.
 */
export function createPublicStoreOrdersApi({ baseUrl }: PublicStoreOrdersApiConfig) {
  const base = (slug: string) => `${baseUrl}/public/stores/${encodeURIComponent(slug)}/orders`;

  return {
    /**
     * Recusado com 409 se a loja fechou, o horário saiu, algo acabou ou o total
     * mudou desde a sacola (`STORE_ORDER_TOTAL_CHANGED`, com o total novo).
     */
    async checkout(
      slug: string,
      tokenDoCliente: string,
      pedido: StoreCheckoutPayload,
    ): Promise<PedidoDaLoja> {
      const response = await apiFetch(base(slug), {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenDoCliente}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido),
      });
      return parseJsonOrThrow<PedidoDaLoja>(response);
    },

    /** Os pedidos deste cliente nesta loja, do mais novo ao mais antigo. */
    async pedidos(slug: string, tokenDoCliente: string): Promise<PedidoDaLoja[]> {
      const response = await apiFetch(base(slug), {
        headers: { Authorization: `Bearer ${tokenDoCliente}` },
      });
      return parseJsonOrThrow<PedidoDaLoja[]>(response);
    },

    /**
     * "Já paguei": pede ao servidor para conferir o Pix no Asaas agora. Devolve o
     * pedido como ficou — entrou na loja, ou ainda esperando.
     */
    async conferirPagamento(
      slug: string,
      tokenDoCliente: string,
      id: string,
    ): Promise<PedidoDaLoja> {
      const response = await apiFetch(`${base(slug)}/${encodeURIComponent(id)}/check-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenDoCliente}` },
      });
      return parseJsonOrThrow<PedidoDaLoja>(response);
    },

    /** Este aparelho passa a receber os avisos dos pedidos com a página fechada. */
    async inscreverAvisos(
      slug: string,
      tokenDoCliente: string,
      inscricao: InscricaoDoNavegador,
    ): Promise<void> {
      const response = await apiFetch(`${base(slug)}/push-subscription`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokenDoCliente}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao),
      });
      await semCorpoOuErro(response);
    },
  };
}
