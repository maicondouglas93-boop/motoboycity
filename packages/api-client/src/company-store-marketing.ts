import type { CupomDaLoja, DestaqueDaLoja, PromocaoDaLoja } from '@motoboycity/types';
import type {
  StoreCouponInput,
  StoreHighlightInput,
  StorePromotionInput,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreMarketingApiConfig {
  baseUrl: string;
}

/**
 * Marketing da loja, do lado do painel. Cada chamada vale só para a empresa do
 * login: o servidor resolve a loja pelo token, nunca por um id que a tela mande.
 */
export function createCompanyStoreMarketingApi({ baseUrl }: CompanyStoreMarketingApiConfig) {
  const raiz = `${baseUrl}/company/store/marketing`;

  function cabecalhos(accessToken: string, comCorpo = false): Record<string, string> {
    return comCorpo
      ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${accessToken}` };
  }

  return {
    /** Todas as promoções da loja, ligadas ou não, a mais nova primeiro. */
    async promotions(accessToken: string): Promise<PromocaoDaLoja[]> {
      const response = await apiFetch(`${raiz}/promotions`, {
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<PromocaoDaLoja[]>(response);
    },

    async createPromotion(accessToken: string, payload: StorePromotionInput) {
      const response = await apiFetch(`${raiz}/promotions`, {
        method: 'POST',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PromocaoDaLoja>(response);
    },

    async updatePromotion(accessToken: string, id: string, payload: StorePromotionInput) {
      const response = await apiFetch(`${raiz}/promotions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PromocaoDaLoja>(response);
    },

    /** Liga ou desliga sem mexer no resto: o gesto mais comum na lista. */
    async setPromotionActive(accessToken: string, id: string, ativa: boolean) {
      const response = await apiFetch(`${raiz}/promotions/${encodeURIComponent(id)}/active`, {
        method: 'PATCH',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify({ ativa }),
      });
      return parseJsonOrThrow<PromocaoDaLoja>(response);
    },

    /** A cópia nasce desligada e sem os usos da original. */
    async duplicatePromotion(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/promotions/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<PromocaoDaLoja>(response);
    },

    async deletePromotion(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/promotions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<{ deleted: true }>(response);
    },

    /** Todos os cupons da loja, ligados ou não, o mais novo primeiro. */
    async coupons(accessToken: string): Promise<CupomDaLoja[]> {
      const response = await apiFetch(`${raiz}/coupons`, { headers: cabecalhos(accessToken) });
      return parseJsonOrThrow<CupomDaLoja[]>(response);
    },

    /** Recusado com 409 se o código já existe na loja (`STORE_COUPON_CODE_TAKEN`). */
    async createCoupon(accessToken: string, payload: StoreCouponInput) {
      const response = await apiFetch(`${raiz}/coupons`, {
        method: 'POST',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CupomDaLoja>(response);
    },

    async updateCoupon(accessToken: string, id: string, payload: StoreCouponInput) {
      const response = await apiFetch(`${raiz}/coupons/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CupomDaLoja>(response);
    },

    /** Liga ou desliga sem mexer no resto: o gesto mais comum na lista. */
    async setCouponActive(accessToken: string, id: string, ativo: boolean) {
      const response = await apiFetch(`${raiz}/coupons/${encodeURIComponent(id)}/active`, {
        method: 'PATCH',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify({ ativo }),
      });
      return parseJsonOrThrow<CupomDaLoja>(response);
    },

    /** A cópia nasce desligada, sem os usos, e com um código livre (`CODIGO-2`). */
    async duplicateCoupon(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/coupons/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<CupomDaLoja>(response);
    },

    async deleteCoupon(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/coupons/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<{ deleted: true }>(response);
    },

    /** Todos os destaques da loja, ligados ou não, na ordem em que aparecem no cardápio. */
    async highlights(accessToken: string): Promise<DestaqueDaLoja[]> {
      const response = await apiFetch(`${raiz}/highlights`, { headers: cabecalhos(accessToken) });
      return parseJsonOrThrow<DestaqueDaLoja[]>(response);
    },

    /** Recusado com 409 se a loja já tem o máximo (`STORE_HIGHLIGHT_LIMIT`). */
    async createHighlight(accessToken: string, payload: StoreHighlightInput) {
      const response = await apiFetch(`${raiz}/highlights`, {
        method: 'POST',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DestaqueDaLoja>(response);
    },

    async updateHighlight(accessToken: string, id: string, payload: StoreHighlightInput) {
      const response = await apiFetch(`${raiz}/highlights/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DestaqueDaLoja>(response);
    },

    /** Liga ou desliga sem mexer no resto: o gesto mais comum na lista. */
    async setHighlightActive(accessToken: string, id: string, ativo: boolean) {
      const response = await apiFetch(`${raiz}/highlights/${encodeURIComponent(id)}/active`, {
        method: 'PATCH',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify({ ativo }),
      });
      return parseJsonOrThrow<DestaqueDaLoja>(response);
    },

    /** A cópia nasce desligada e no fim da fila. */
    async duplicateHighlight(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/highlights/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<DestaqueDaLoja>(response);
    },

    async deleteHighlight(accessToken: string, id: string) {
      const response = await apiFetch(`${raiz}/highlights/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: cabecalhos(accessToken),
      });
      return parseJsonOrThrow<{ deleted: true }>(response);
    },

    /**
     * A ordem nova: os ids de TODOS os destaques, do primeiro ao último. Uma lista
     * velha (outra aba criou ou apagou um) é recusada com 409
     * (`STORE_HIGHLIGHT_ORDER_STALE`). Devolve os destaques já na ordem gravada.
     */
    async reorderHighlights(accessToken: string, ids: string[]): Promise<DestaqueDaLoja[]> {
      const response = await apiFetch(`${raiz}/highlights/order`, {
        method: 'PUT',
        headers: cabecalhos(accessToken, true),
        body: JSON.stringify({ ids }),
      });
      return parseJsonOrThrow<DestaqueDaLoja[]>(response);
    },
  };
}
