import type { CupomDaLoja, PromocaoDaLoja } from '@motoboycity/types';
import type { StoreCouponInput, StorePromotionInput } from '@motoboycity/validation';
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
  };
}
