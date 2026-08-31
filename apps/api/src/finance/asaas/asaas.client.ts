import { Injectable } from '@nestjs/common';
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
export type AsaasOperation =
  'FIND_CUSTOMER' | 'CREATE_CUSTOMER' | 'FIND_PAYMENT' | 'CREATE_PAYMENT' | 'GET_PIX_QR_CODE';

@Injectable()
export class AsaasClient {
  constructor(private readonly config: ConfigService) {}

  async findCustomerByExternalReference(externalReference: string): Promise<string | null> {
    const result = await this.request(
      `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=2`,
      {},
      asaasCustomerListSchema,
      'FIND_CUSTOMER',
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
      'CREATE_CUSTOMER',
    );
    return result.id;
  }

  async findPaymentByExternalReference(externalReference: string): Promise<AsaasPayment | null> {
    const result = await this.request(
      `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=2`,
      {},
      asaasPaymentListSchema,
      'FIND_PAYMENT',
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
      'CREATE_PAYMENT',
    );
  }

  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request(
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      {},
      asaasPixQrCodeSchema,
      'GET_PIX_QR_CODE',
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    operation: AsaasOperation,
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
      throw new AsaasProviderError(
        operation,
        'NETWORK_OR_TIMEOUT',
        undefined,
        operation === 'CREATE_PAYMENT',
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AsaasProviderError(
        operation,
        'INVALID_JSON',
        response.status,
        operation === 'CREATE_PAYMENT',
      );
    }
    if (!response.ok) {
      throw new AsaasProviderError(
        operation,
        'REQUEST_REJECTED',
        response.status,
        operation === 'CREATE_PAYMENT' && response.status >= 500,
        providerErrorCode(body),
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AsaasProviderError(
        operation,
        'INVALID_RESPONSE',
        response.status,
        operation === 'CREATE_PAYMENT',
      );
    }
    return parsed.data;
  }
}

export class AsaasProviderError extends Error {
  constructor(
    readonly operation: AsaasOperation,
    readonly code: string,
    readonly httpStatus?: number,
    readonly outcomeUnknown = false,
    readonly providerCode?: string,
  ) {
    super(code);
    this.name = 'AsaasProviderError';
  }
}

function providerErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('errors' in body)) return undefined;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return undefined;
  const first = errors.find(
    (error): error is { code: string } =>
      Boolean(error) &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string',
  );
  if (!first) return undefined;
  const sanitized = first.code
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 60);
  return sanitized || undefined;
}
