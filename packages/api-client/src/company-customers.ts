import type { CompanyCustomer, CompanyCustomerListResult } from '@motoboycity/types';
import type {
  CreateCompanyCustomerPayload,
  UpdateCompanyCustomerPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export interface CompanyCustomersApiConfig {
  baseUrl: string;
}

export function createCompanyCustomersApi({ baseUrl }: CompanyCustomersApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async list(
      accessToken: string,
      filters?: { q?: string; page?: number; pageSize?: number },
    ): Promise<CompanyCustomerListResult> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/company/customers${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyCustomerListResult>(response);
    },

    async detail(accessToken: string, id: string): Promise<CompanyCustomer> {
      const response = await fetch(`${baseUrl}/company/customers/${id}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CompanyCustomer>(response);
    },

    async match(
      accessToken: string,
      identifiers: { cpf?: string; phone?: string },
    ): Promise<{ customer: CompanyCustomer | null }> {
      const params = new URLSearchParams();
      if (identifiers.cpf) params.set('cpf', identifiers.cpf);
      if (identifiers.phone) params.set('phone', identifiers.phone);
      const response = await fetch(`${baseUrl}/company/customers/match?${params.toString()}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ customer: CompanyCustomer | null }>(response);
    },

    async create(
      accessToken: string,
      payload: CreateCompanyCustomerPayload,
    ): Promise<CompanyCustomer> {
      const response = await fetch(`${baseUrl}/company/customers`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CompanyCustomer>(response);
    },

    async update(
      accessToken: string,
      id: string,
      payload: UpdateCompanyCustomerPayload,
    ): Promise<CompanyCustomer> {
      const response = await fetch(`${baseUrl}/company/customers/${id}`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<CompanyCustomer>(response);
    },

    async remove(accessToken: string, id: string): Promise<{ deleted: true }> {
      const response = await fetch(`${baseUrl}/company/customers/${id}`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<{ deleted: true }>(response);
    },
  };
}
