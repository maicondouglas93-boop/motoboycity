import type {
  CompanyInvoiceDetail,
  CompanyInvoiceListItem,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceStatus,
  ManualInvoiceCandidate,
  ManualInvoicePreview,
  PaymentMethod,
} from '@motoboycity/types';
import type { ManualInvoicePayload, UpdateInvoiceDueDatePayload } from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

type InvoiceFilters = { status?: InvoiceStatus; from?: string; to?: string; companyId?: string };

function queryFromFilters(filters?: InvoiceFilters): string {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.companyId) params.set('companyId', filters.companyId);
  return params.toString() ? `?${params.toString()}` : '';
}

function withAuth(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export interface CompanyInvoicesApiConfig {
  baseUrl: string;
}

export function createCompanyInvoicesApi({ baseUrl }: CompanyInvoicesApiConfig) {
  return {
    async list(accessToken: string, filters?: InvoiceFilters): Promise<CompanyInvoiceListItem[]> {
      const response = await fetch(`${baseUrl}/company/invoices${queryFromFilters(filters)}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyInvoiceListItem[]>(response);
    },

    async detail(accessToken: string, invoiceId: string): Promise<CompanyInvoiceDetail> {
      const response = await fetch(`${baseUrl}/company/invoices/${invoiceId}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyInvoiceDetail>(response);
    },
  };
}

export interface AdminInvoicesApiConfig {
  baseUrl: string;
}

export function createAdminInvoicesApi({ baseUrl }: AdminInvoicesApiConfig) {
  return {
    async list(accessToken: string, filters?: InvoiceFilters): Promise<InvoiceListItem[]> {
      const response = await fetch(
        `${baseUrl}/admin/financial/invoices${queryFromFilters(filters)}`,
        {
          headers: withAuth(accessToken),
        },
      );
      return parseJsonOrThrow<InvoiceListItem[]>(response);
    },

    async detail(accessToken: string, invoiceId: string): Promise<InvoiceDetail> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/${invoiceId}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<InvoiceDetail>(response);
    },

    async close(accessToken: string, issueDate: string): Promise<InvoiceListItem[]> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/close`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDate }),
      });
      return parseJsonOrThrow<InvoiceListItem[]>(response);
    },

    async manualCandidates(
      accessToken: string,
      companyId: string,
    ): Promise<ManualInvoiceCandidate[]> {
      const params = new URLSearchParams({ companyId });
      const response = await fetch(
        `${baseUrl}/admin/financial/invoices/manual/candidates?${params.toString()}`,
        { headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<ManualInvoiceCandidate[]>(response);
    },

    async previewManual(
      accessToken: string,
      payload: ManualInvoicePayload,
    ): Promise<ManualInvoicePreview> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/manual/preview`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<ManualInvoicePreview>(response);
    },

    async createManual(accessToken: string, payload: ManualInvoicePayload): Promise<InvoiceDetail> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/manual`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<InvoiceDetail>(response);
    },

    /**
     * Cancela a fatura e devolve as entregas para cobranca. Motivo obrigatorio.
     */
    async cancel(
      accessToken: string,
      invoiceId: string,
      payload: { reason: string },
    ): Promise<InvoiceDetail> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/${invoiceId}/cancel`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<InvoiceDetail>(response);
    },

    async markPaid(
      accessToken: string,
      invoiceId: string,
      payload: { paymentDate: string; paymentMethod: PaymentMethod },
    ): Promise<InvoiceDetail> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/${invoiceId}/mark-paid`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<InvoiceDetail>(response);
    },

    async updateDueDate(
      accessToken: string,
      invoiceId: string,
      payload: UpdateInvoiceDueDatePayload,
    ): Promise<InvoiceDetail> {
      const response = await fetch(`${baseUrl}/admin/financial/invoices/${invoiceId}/due-date`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<InvoiceDetail>(response);
    },
  };
}
