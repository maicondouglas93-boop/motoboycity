import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import { requireAsaasRuntimeConfig } from './asaas.config';
import {
  asaasCustomerListSchema,
  asaasCustomerSchema,
  asaasPaymentListSchema,
  asaasPaymentSchema,
  asaasPixQrCodeSchema,
} from './asaas.schemas';

const REQUEST_TIMEOUT_MS = 15_000;

export type AsaasPayment = z.infer<typeof asaasPaymentSchema>;
export type AsaasPixQrCode = z.infer<typeof asaasPixQrCodeSchema>;

@Injectable()
export class AsaasClient {
  constructor(private readonly config: ConfigService) {}

  async findCustomerByExternalReference(externalReference: string): Promise<string | null> {
    const result = await this.request(
      `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=2`,
      {},
      asaasCustomerListSchema,
    );
    return result.data[0]?.id ?? null;
  }

  async createCustomer(input: {
    name: string;
    cpfCnpj: string;
    externalReference: string;
    email?: string;
    mobilePhone?: string;
  }): Promise<string> {
    const result = await this.request(
      '/customers',
      { method: 'POST', body: JSON.stringify(input) },
      asaasCustomerSchema,
    );
    return result.id;
  }

  async findPaymentByExternalReference(externalReference: string): Promise<AsaasPayment | null> {
    const result = await this.request(
      `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=2`,
      {},
      asaasPaymentListSchema,
    );
    return result.data[0] ?? null;
  }

  createPixPayment(input: {
    customer: string;
    value: number;
    dueDate: string;
    description: string;
    externalReference: string;
  }): Promise<AsaasPayment> {
    return this.request(
      '/payments',
      {
        method: 'POST',
        body: JSON.stringify({ ...input, billingType: 'PIX' }),
      },
      asaasPaymentSchema,
    );
  }

  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request(
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      {},
      asaasPixQrCodeSchema,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    const runtime = requireAsaasRuntimeConfig(this.config);
    let response: Response;
    try {
      response = await fetch(`${runtime.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          access_token: runtime.apiKey,
          'User-Agent': 'MOTOboyCity/1.0',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new AsaasProviderError('NETWORK_OR_TIMEOUT', undefined, true);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AsaasProviderError('INVALID_JSON', response.status, response.status >= 500);
    }
    if (!response.ok) {
      throw new AsaasProviderError('REQUEST_REJECTED', response.status, response.status >= 500);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadGatewayException('O Asaas retornou uma resposta inválida.');
    }
    return parsed.data;
  }
}

export class AsaasProviderError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus?: number,
    readonly outcomeUnknown = false,
  ) {
    super(code);
    this.name = 'AsaasProviderError';
  }
}
