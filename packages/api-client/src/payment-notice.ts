import type { PaymentNotice, PaymentNoticeQueueItem } from '@motoboycity/types';
import type {
  ConfirmPaymentNoticePayload,
  CreatePaymentNoticePayload,
  RejectPaymentNoticePayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export interface PaymentNoticeApiConfig {
  baseUrl: string;
}

/**
 * Avisos de pagamento.
 *
 * Repare no que NAO existe aqui: nenhum metodo da loja muda o status da
 * fatura. Confirmar e recusar sao rotas de admin.
 */
export function createPaymentNoticeApi({ baseUrl }: PaymentNoticeApiConfig) {
  function headers(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  }

  return {
    async create(
      accessToken: string,
      invoiceId: string,
      payload: CreatePaymentNoticePayload,
    ): Promise<PaymentNotice> {
      const response = await fetch(`${baseUrl}/company/invoices/${invoiceId}/payment-notice`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PaymentNotice>(response);
    },

    async listForInvoice(accessToken: string, invoiceId: string): Promise<PaymentNotice[]> {
      const response = await fetch(`${baseUrl}/company/invoices/${invoiceId}/payment-notices`, {
        headers: headers(accessToken),
      });
      return parseJsonOrThrow<PaymentNotice[]>(response);
    },

    async queue(
      accessToken: string,
      status: 'PENDING' | 'CONFIRMED' | 'REJECTED' = 'PENDING',
    ): Promise<PaymentNoticeQueueItem[]> {
      const response = await fetch(`${baseUrl}/admin/payment-notices?status=${status}`, {
        headers: headers(accessToken),
      });
      return parseJsonOrThrow<PaymentNoticeQueueItem[]>(response);
    },

    async confirm(
      accessToken: string,
      noticeId: string,
      payload: ConfirmPaymentNoticePayload,
    ): Promise<PaymentNotice> {
      const response = await fetch(`${baseUrl}/admin/payment-notices/${noticeId}/confirm`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PaymentNotice>(response);
    },

    async reject(
      accessToken: string,
      noticeId: string,
      payload: RejectPaymentNoticePayload,
    ): Promise<PaymentNotice> {
      const response = await fetch(`${baseUrl}/admin/payment-notices/${noticeId}/reject`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<PaymentNotice>(response);
    },
  };
}
